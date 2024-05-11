const express = require('express')

const tourController = require('./../controllers/tourController');
const authController = require('../controllers/authController')
const reviewRouter = require('../routes/reviewRoutes')
const router = express.Router()


router.use('/:tourId/reviews', reviewRouter)

// router.param('id',tourController.checkID)

router.route('/top-5-cheap').get(tourController.aliasTopTours, tourController.getAllRoutes)
router.route('/tour-stats').get(tourController.getTourStats)
router.route('/monthly-plan/:year').get(tourController.getMonthlyPlan)


router
    .route('/')
    .get(authController.protect, tourController.getAllRoutes)
    .post(tourController.createTour)


router
    .route('/:id')
    .get(tourController.getTour)
    .patch(tourController.updateTour)
    .delete(
        authController.protect,
        authController.restrictTo('admin', 'lead-guide'), 
        tourController.deleteTour
    )

// router
//     .route('/:tourId/reviews')
//     .post(
//         authController.protect,
//         authController.restrictTo('user'),
//         reviewController.createReview
//     )
//     .get()


module.exports = router

