const express = require('express');
const TripController = require('../controllers/tripController');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', TripController.getAllTrips);
router.get('/feed', auth, TripController.getFollowedFeed);
router.get('/:tripId', TripController.getTrip);

router.use(auth);

router.post('/', TripController.createTrip);
router.put('/:tripId', TripController.updateTrip);
router.delete('/:tripId', TripController.deleteTrip);

router.post('/:tripId/approve', TripController.approveTrip);
router.get('/admin/pending', TripController.getPendingTrips);

router.post('/:tripId/join', TripController.joinTrip);
router.delete('/:tripId/leave', TripController.leaveTrip);

router.get('/user/my-trips', TripController.getUserTrips);

router.put('/:tripId/itinerary', TripController.updateItinerary);

module.exports = router;
