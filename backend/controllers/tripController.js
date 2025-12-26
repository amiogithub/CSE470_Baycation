const Trip = require('../models/Trip');
const User = require('../models/User');
const { v4: uuidv4 } = require('uuid');

class TripController {
  static async createTrip(req, res) {
    try {
      const { title, description, destination, startDate, endDate, maxParticipants, budget, difficulty, tripType, tags, requirements, isPublic } = req.body;
      const trip = new Trip({
        trip_id: uuidv4(),
        title,
        description,
        destination,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        maxParticipants,
        budget,
        difficulty,
        tripType,
        organizer: req.user.userId,
        tags: tags || [],
        requirements: requirements || [],
        isPublic: isPublic !== undefined ? isPublic : true,
        status: 'planning',
        isApproved: false,
      });
      await trip.save();
      await trip.populate('organizer', 'name email');
      await User.findByIdAndUpdate(req.user.userId, { $push: { joinedTrips: trip._id } });
      res.status(201).json({ success: true, message: 'Trip submitted for approval', data: { trip } });
    } catch (error) {
      console.error('Create trip error:', error);
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({ success: false, message: 'Validation failed', errors });
      }
      res.status(500).json({ success: false, message: 'Server error while creating trip' });
    }
  }

  static async getPendingTrips(req, res) {
    try {
      const approver = await User.findById(req.user.userId).select('role email');
      const superEmail = process.env.SUPER_ADMIN_EMAIL;
      const superId = process.env.SUPER_ADMIN_ID;
      const isSuperAdmin = !!approver && ((superEmail && approver.email === superEmail) || (superId && req.user.userId && req.user.userId.toString() === superId.toString()));
      if (!approver || (approver.role !== 'admin' && !isSuperAdmin)) return res.status(403).json({ success: false, message: 'Admin access required' });
      const trips = await Trip.find({ isPublic: true, isApproved: false }).populate('organizer', 'name email').sort({ createdAt: -1 }).limit(100);
      res.json({ success: true, data: { trips } });
    } catch (error) {
      console.error('Get pending trips error:', error);
      res.status(500).json({ success: false, message: 'Server error while fetching pending trips' });
    }
  }

  static async approveTrip(req, res) {
    try {
      const { tripId } = req.params;
      const approver = await User.findById(req.user.userId).select('role name email');
      const superEmail = process.env.SUPER_ADMIN_EMAIL;
      const superId = process.env.SUPER_ADMIN_ID;
      const isSuperAdmin = !!approver && ((superEmail && approver.email === superEmail) || (superId && req.user.userId && req.user.userId.toString() === superId.toString()));
      if (!approver || (approver.role !== 'admin' && !isSuperAdmin)) return res.status(403).json({ success: false, message: 'Admin access required' });
      const trip = await Trip.findByIdAndUpdate(tripId, { isApproved: true, approvedAt: new Date(), approvedBy: approver._id }, { new: true }).populate('organizer', 'name email');
      if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
      const io = req.app.get('io');
      if (io) io.emit('tripCreated', { trip: trip, organizer: { name: trip.organizer.name, _id: trip.organizer._id } });
      res.json({ success: true, message: 'Trip approved', data: { trip } });
    } catch (error) {
      console.error('Approve trip error:', error);
      res.status(500).json({ success: false, message: 'Server error while approving trip' });
    }
  }

  static async getFollowedFeed(req, res) {
    try {
      const user = await User.findById(req.user.userId).select('travelBuddies');
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      const followedIds = Array.isArray(user.travelBuddies) ? user.travelBuddies : [];
      if (followedIds.length === 0) return res.json({ success: true, data: { trips: [] } });
      const trips = await Trip.find({ isPublic: true, $or: [{ organizer: { $in: followedIds } }, { 'participants.user': { $in: followedIds } }] }).populate('organizer', 'name email').sort({ createdAt: -1 }).limit(20);
      res.json({ success: true, data: { trips } });
    } catch (error) {
      console.error('Get followed feed error:', error);
      res.status(500).json({ success: false, message: 'Server error while fetching feed' });
    }
  }

  static async getAllTrips(req, res) {
    try {
      const { destination, tripType, difficulty, minBudget, maxBudget, startDate, endDate, search, page = 1, limit = 10 } = req.query;
      let query = { isPublic: true, isApproved: true };
      if (search) query.$or = [{ title: { $regex: search, $options: 'i' } }, { description: { $regex: search, $options: 'i' } }, { destination: { $regex: search, $options: 'i' } }];
      if (destination) query.destination = { $regex: destination, $options: 'i' };
      if (tripType) query.tripType = tripType;
      if (difficulty) query.difficulty = difficulty;
      if (minBudget || maxBudget) {
        query['budget.min'] = {};
        if (minBudget) query['budget.min'].$gte = parseInt(minBudget);
        if (maxBudget) query['budget.max'] = { $lte: parseInt(maxBudget) };
      }
      if (startDate) query.startDate = { $gte: new Date(startDate) };
      if (endDate) query.endDate = { $lte: new Date(endDate) };
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const trips = await Trip.find(query).populate('organizer', 'name email bio').populate('participants.user', 'name email').skip(skip).limit(parseInt(limit));
      const total = await Trip.countDocuments(query);
      res.json({ success: true, data: { trips, pagination: { current: parseInt(page), total: Math.ceil(total / parseInt(limit)), count: trips.length, totalTrips: total } } });
    } catch (error) {
      console.error('Get all trips error:', error);
      res.status(500).json({ success: false, message: 'Server error while fetching trips' });
    }
  }

  static async getTrip(req, res) {
    try {
      const { tripId } = req.params;
      const trip = await Trip.findById(tripId).populate('organizer', 'name email bio location isOnline lastSeen').populate('participants.user', 'name email bio isOnline lastSeen');
      if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
      res.json({ success: true, data: { trip } });
    } catch (error) {
      console.error('Get trip error:', error);
      res.status(500).json({ success: false, message: 'Server error while fetching trip' });
    }
  }

  static async updateTrip(req, res) {
    try {
      const { tripId } = req.params;
      const updateData = req.body;
      const trip = await Trip.findById(tripId);
      if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
      if (trip.organizer.toString() !== req.user.userId) return res.status(403).json({ success: false, message: 'Only trip organizer can update this trip' });
      Object.assign(trip, updateData);
      await trip.save();
      await trip.populate('organizer', 'name email');
      const io = req.app.get('io');
      if (io) io.to(`trip-${tripId}`).emit('tripUpdated', { trip: trip, updatedBy: req.user.userId });
      res.json({ success: true, message: 'Trip updated successfully', data: { trip } });
    } catch (error) {
      console.error('Update trip error:', error);
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({ success: false, message: 'Validation failed', errors });
      }
      res.status(500).json({ success: false, message: 'Server error while updating trip' });
    }
  }

  static async deleteTrip(req, res) {
    try {
      const { tripId } = req.params;
      const trip = await Trip.findById(tripId);
      if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
      const requester = await User.findById(req.user.userId).select('role email');
      const superEmail = process.env.SUPER_ADMIN_EMAIL;
      const superId = process.env.SUPER_ADMIN_ID;
      const isSuperAdmin = !!requester && ((superEmail && requester.email === superEmail) || (superId && req.user.userId && req.user.userId.toString() === superId.toString()));
      const isOrganizer = trip.organizer.toString() === req.user.userId;
      const isAdmin = requester && requester.role === 'admin';
      if (!isOrganizer && !isAdmin && !isSuperAdmin) return res.status(403).json({ success: false, message: 'Only organizer or admin can delete this trip' });
      await Trip.findByIdAndDelete(tripId);
      await User.updateMany({ joinedTrips: tripId }, { $pull: { joinedTrips: tripId } });
      const io = req.app.get('io');
      if (io) io.to(`trip-${tripId}`).emit('tripDeleted', { tripId: tripId, deletedBy: req.user.userId });
      res.json({ success: true, message: 'Trip deleted successfully' });
    } catch (error) {
      console.error('Delete trip error:', error);
      res.status(500).json({ success: false, message: 'Server error while deleting trip' });
    }
  }

  static async joinTrip(req, res) {
    try {
      const { tripId } = req.params;
      const userId = req.user.userId;
      const trip = await Trip.findById(tripId).populate('organizer', 'name');
      if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
      if (!trip.isApproved) return res.status(400).json({ success: false, message: 'This trip is pending approval and not open for joining yet' });
      if (trip.currentParticipants >= trip.maxParticipants) return res.status(400).json({ success: false, message: 'Trip is full' });
      if (trip.status === 'completed' || trip.status === 'cancelled') return res.status(400).json({ success: false, message: 'This trip is not accepting participants' });
      if (trip.organizer._id.toString() === userId) return res.status(400).json({ success: false, message: 'You cannot join your own trip' });
      const alreadyJoined = trip.participants.some(p => (p.user && typeof p.user === 'object' && p.user._id ? p.user._id.toString() === userId : p.user && p.user.toString() === userId));
      if (alreadyJoined) return res.status(400).json({ success: false, message: 'You have already joined this trip' });
      trip.participants.push({ user: userId, status: 'confirmed', joinedAt: new Date() });
      trip.updateParticipantCount();
      await trip.save();
      await User.findByIdAndUpdate(userId, { $addToSet: { joinedTrips: tripId } });
      const user = await User.findById(userId).select('name email');
      await trip.populate('participants.user', 'name email');
      const io = req.app.get('io');
      if (io) {
        io.to(`trip-${tripId}`).emit('userJoined', { trip: trip, user: user });
        io.emit('tripUpdated', { trip: trip });
      }
      res.json({ success: true, message: 'Successfully joined the trip', data: { trip } });
    } catch (error) {
      console.error('Join trip error:', error);
      console.error('Error stack:', error.stack);
      res.status(500).json({ success: false, message: 'Server error while joining trip', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
    }
  }

  static async leaveTrip(req, res) {
    try {
      const { tripId } = req.params;
      const userId = req.user.userId;
      const trip = await Trip.findById(tripId);
      if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
      if (trip.organizer.toString() === userId) return res.status(400).json({ success: false, message: 'Trip organizer cannot leave the trip. Delete the trip instead.' });
      trip.participants = trip.participants.filter(p => p.user.toString() !== userId);
      trip.updateParticipantCount();
      await trip.save();
      await User.findByIdAndUpdate(userId, { $pull: { joinedTrips: tripId } });
      const user = await User.findById(userId).select('name email');
      const io = req.app.get('io');
      if (io) {
        io.to(`trip-${tripId}`).emit('userLeft', { trip: trip, user: user });
        io.emit('tripUpdated', { trip: trip });
      }
      res.json({ success: true, message: 'Successfully left the trip' });
    } catch (error) {
      console.error('Leave trip error:', error);
      res.status(500).json({ success: false, message: 'Server error while leaving trip' });
    }
  }

  static async getUserTrips(req, res) {
    try {
      const userId = req.user.userId;
      const { type = 'all' } = req.query;
      let query = {};
      if (type === 'organized') query.organizer = userId;
      else if (type === 'joined') query['participants.user'] = userId;
      else query.$or = [{ organizer: userId }, { 'participants.user': userId }];
      const trips = await Trip.find(query).populate('organizer', 'name email').populate('participants.user', 'name email');
      res.json({ success: true, data: { trips } });
    } catch (error) {
      console.error('Get user trips error:', error);
      res.status(500).json({ success: false, message: 'Server error while fetching user trips' });
    }
  }

  static async updateItinerary(req, res) {
    try {
      const { tripId } = req.params;
      const { itinerary } = req.body;
      const trip = await Trip.findById(tripId);
      if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
      const isOrganizer = trip.organizer.toString() === req.user.userId;
      const isParticipant = trip.participants.some(p => p.user.toString() === req.user.userId && p.status === 'confirmed');
      if (!isOrganizer && !isParticipant) return res.status(403).json({ success: false, message: 'Only trip organizer or participants can update itinerary' });
      const updatedItinerary = itinerary.map(day => ({ ...day, activities: day.activities.map(activity => ({ ...activity, addedBy: activity.addedBy || req.user.userId, addedAt: activity.addedAt || new Date() })) }));
      trip.itinerary = updatedItinerary;
      await trip.save();
      const user = await User.findById(req.user.userId).select('name');
      const io = req.app.get('io');
      if (io) io.to(`trip-${tripId}`).emit('itineraryUpdated', { trip: trip, updatedBy: { _id: req.user.userId, name: user.name }, itinerary: updatedItinerary });
      res.json({ success: true, message: 'Itinerary updated successfully', data: { trip } });
    } catch (error) {
      console.error('Update itinerary error:', error);
      res.status(500).json({ success: false, message: 'Server error while updating itinerary' });
    }
  }
}

module.exports = TripController;
