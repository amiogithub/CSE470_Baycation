const express = require('express');
const TravelerController = require('../controllers/travelerController');
const auth = require('../middleware/auth');

const router = express.Router();

router.use(auth);

router.get('/', TravelerController.getAllTravelers);
router.get('/:travelerId', TravelerController.getTravelerProfile);
router.post('/:travelerId/follow', TravelerController.followTraveler);
router.delete('/:travelerId/follow', TravelerController.unfollowTraveler);
router.get('/me/travel-buddies', TravelerController.getTravelBuddies);

module.exports = router;
