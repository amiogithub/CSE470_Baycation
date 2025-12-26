const User = require('../models/User');

class TravelerController {
  static async getAllTravelers(req, res) {
    try {
      const { search, location, role } = req.query;
      const currentUserId = req.user.userId;
      let query = {
        _id: { $ne: currentUserId },
        role: { $ne: 'admin' }
      };
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { bio: { $regex: search, $options: 'i' } },
          { preferences: { $regex: search, $options: 'i' } }
        ];
      }
      if (location) {
        query.location = { $regex: location, $options: 'i' };
      }

      if (role) {
        query.role = role;
      }

      const travelers = await User.find(query)
        .select('name email bio location preferences role createdAt travelBuddies followedBy isOnline lastSeen')
        .populate('travelBuddies', 'name')
        .sort({ isOnline: -1, lastSeen: -1, createdAt: -1 })
        .limit(50);
      res.json({
        success: true,
        data: { travelers }
      });
    } catch (error) {
      console.error('Get all travelers error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while fetching travelers'
      });
    }
  }
  static async getTravelerProfile(req, res) {
    try {
      const { travelerId } = req.params;      
      const traveler = await User.findById(travelerId)
        .select('-password')
        .populate('travelBuddies', 'name email bio location isOnline lastSeen')
        .populate('followedBy', 'name email')
        .populate('joinedTrips', 'title destination startDate endDate status');
      if (!traveler) {
        return res.status(404).json({
          success: false,
          message: 'Traveler not found'
        });
      }
      res.json({
        success: true,
        data: { traveler }
      });
    } catch (error) {
      console.error('Get traveler profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while fetching traveler profile'
      });
    }
  }
  static async followTraveler(req, res) {
    try {
      const { travelerId } = req.params;
      const currentUserId = req.user.userId;

      if (travelerId === currentUserId) {
        return res.status(400).json({
          success: false,
          message: 'You cannot follow yourself'
        });
      }

      const [currentUser, targetTraveler] = await Promise.all([
        User.findById(currentUserId).select('_id travelBuddies'),
        User.findById(travelerId).select('_id followedBy')
      ]);

      if (!targetTraveler) {
        return res.status(404).json({
          success: false,
          message: 'Traveler not found'
        });
      }

      const targetFull = await User.findById(travelerId).select('role');
      if (targetFull && targetFull.role === 'admin') {
        return res.status(400).json({
          success: false,
          message: 'Connecting with admin accounts is not allowed'
        });
      }

      if (currentUser.travelBuddies && currentUser.travelBuddies.some(id => id.toString() === travelerId)) {
        return res.status(400).json({
          success: false,
          message: 'You are already following this traveler'
        });
      }

      await Promise.all([
        User.updateOne(
          { _id: currentUserId },
          { $addToSet: { travelBuddies: travelerId } }
        ),
        User.updateOne(
          { _id: travelerId },
          { $addToSet: { followedBy: currentUserId } }
        )
      ]);

      const updated = await User.findById(currentUserId).select('travelBuddies');
      res.json({
        success: true,
        message: 'Now following traveler successfully',
        data: { travelBuddiesCount: updated.travelBuddies?.length || 0 }
      });
    } catch (error) {
      console.error('Follow traveler error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while following traveler'
      });
    }
  }

  static async unfollowTraveler(req, res) {
    try {
      const { travelerId } = req.params;
      const currentUserId = req.user.userId;
      const [currentUser, targetTraveler] = await Promise.all([
        User.findById(currentUserId),
        User.findById(travelerId)
      ]);
      if (!targetTraveler) {
        return res.status(404).json({
          success: false,
          message: 'Traveler not found'
        });
      }
      currentUser.travelBuddies = currentUser.travelBuddies.filter(
        id => id.toString() !== travelerId
      );
      targetTraveler.followedBy = targetTraveler.followedBy.filter(
        id => id.toString() !== currentUserId
      );
      await Promise.all([
        currentUser.save(),
        targetTraveler.save()
      ]);
      res.json({
        success: true,
        message: 'Unfollowed traveler successfully'
      });
    } catch (error) {
      console.error('Unfollow traveler error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while unfollowing traveler'
      });
    }
  }
  static async getTravelBuddies(req, res) {
    try {
      const currentUserId = req.user.userId;      
      const user = await User.findById(currentUserId)
        .populate({
          path: 'travelBuddies',
          select: 'name email bio location preferences role createdAt isOnline lastSeen',
          match: { role: { $ne: 'admin' } }
        });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      res.json({
        success: true,
        data: { travelBuddies: user.travelBuddies }
      });
    } catch (error) {
      console.error('Get travel buddies error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while fetching travel buddies'
      });
    }
  }
}
module.exports = TravelerController;
