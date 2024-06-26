const jwt = require('jsonwebtoken')
const User = require("../models/userModel")
const catchAsync = require("../utils/catchAsync")
const AppError = require('../utils/appError')
const bcrypt = require('bcryptjs')
const {promisify} = require('util')
const sendEmail = require('../utils/email')
const crypto = require('crypto')
const Email = require('../utils/email')



const signToken = id => {
    return jwt.sign({id}, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRY
    });
}

const createSendToken = (user, statusCode, res) => {
    const token = signToken(user._id);
    const cookieOptions = {
        expires: new Date(Date.now() + 24*60*60*1000*process.env.JWT_COOKIE_EXPIRY),
        httpOnly:true   // to prevent cross site scripting attacks
    }
    if (process.env.NODE_ENV === 'production'){cookieOptions.secure = true}

    user.password = undefined


    res.cookie('jwt',token, cookieOptions)
    res.locals.user = user

    res.status(statusCode).json({
        status:'success',
        token,
        data:{
            user
        }
    })
}
exports.signup = catchAsync(async (req,res,next) => {
    const newUser = await User.create({
        name:req.body.name,
        email: req.body.email,
        password:req.body.password,
        passwordConfirm:req.body.passwordConfirm,
        passwordChangedAt:req.body.passwordChangedAt,
        role:req.body.role
    })

    const url = `${req.protocol}://${req.get('host')}/me`

    await new Email(newUser, url).sendWelcome()
    createSendToken(newUser,201,res)

})

exports.login = catchAsync(async (req,res,next) => {
    const {email, password} = req.body
    // check if email exists
    // check if password is correct
    // if everything ok, send token to client
    if (!email || !password){
        return next(new AppError('Please provide email and password', 400))
    }
    const user = await User.findOne({email:email}).select('+password')

    if (!user || !(await user.correctPassword(password, user.password))){
        return next(new AppError('Incorrect email or password', 401))
    }
    createSendToken(user,200,res)
})


exports.protect = catchAsync(async (req,res,next) => {
    // get the token and check if it's there
    // validate token 
    // next
    let token = ''
    if (req.headers.authorization  && req.headers.authorization.startsWith('Bearer')){
        token = req.headers.authorization.split(' ')[1]
    }else if(req.cookies.jwt){
        token = req.cookies.jwt
    }

    if(!token){
        return next(new AppError('You are not logged in, Please log in to get access', 401))
    }

    // promisify mein pass sirf fxn hi kara hai, saath ke saath call bhi karliya
    const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET)


    // check if user exists
    const currentUser = await User.findById(decoded.id)
    if (!currentUser){
        return next(new AppError('The user belonging to this token, does no exist', 401))
    }

    // check if user changed password after JWT was issued
    if (currentUser.changedPasswordAfter(decoded.iat)){
        return next(new AppError("user recently changed password", 401))
    }

    // grant excess to protected route
    req.user = currentUser
    res.locals.user = currentUser
    next()
})

exports.restrictTo = (...roles) => {
    return (req,res,next) => {
        // roles ['admin', 'lead-guide'].  role = 'user'
        if(!roles.includes(req.user.role)){
            return next(
                new AppError('you do not have access for this action', 403)
            )
        }
        next()
    }
}

exports.forgotPassword = catchAsync(async (req,res,next) => {
    const user = await User.findOne({email:req.body.email})

    if(!user){
        next(
            new AppError('there is no user with this mail')
        )
    }
    // generate random reset token
    const resetToken = user.createPasswordResetToken()
    await user.save({validateBeforeSave:false})
    // send it to user email

    // const message = `forgot password? submit a patch request with your new password and passwordConfirm to ${resetURL}. \n 
    //     If you didn't forget your password, ignore this`

    // if we get error in this, its not sufficient to just catch the error
    // we'll need to undo the token changes in the database also

    try{
        const resetURL = `${req.protocol}://${req.get('host')}/api/v1/users/resetPassword/${resetToken}`

        // await sendEmail({
        //     email:user.email,
        //     subject:'password reset token',
        //     message
        // })
        await new Email(user, resetURL).sendPasswordReset()

        res.status(200).json({
            status:'success',
            message:'token sent success'
        })
    }catch(err){
        user.passwordResetToken = undefined
        user.passwordResetExpires = undefined
        await user.save({validateBeforeSave:false})
        return next(new AppError("error sending the mail", 500))
    }

})

exports.resetPassword = catchAsync(async (req,res, next) => {
    // get user based on token
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

    const user = await User.findOne({
        passwordResetToken:hashedToken,
        passwordResetExpires:{$gt:Date.now()}
    })

    //if token has not expired, and there is user, set the new password
    if(!user){
        return next(new AppError('token is invalid or has expired', 400))
    }
    user.password = req.body.password
    user.passwordConfirm = req.body.passwordConfirm
    user.passwordResetToken = undefined
    user.passwordResetExpires = undefined
    await user.save()
    // update changedpasswordAt property for the user
    //-> will be done in user model

    // log the user in, send JWT
    createSendToken(user,200,res)
})

exports.updatePassword = catchAsync(async (req,res,next) => {
    // get user from the collection
    const user = await User.findById(req.user.id).select('+password')
    // check if POSTed current password is correct
    const valid = await user.correctPassword(req.body.passwordCurrent, user.password)
    if (!valid){
        return next(new AppError("Password incorrect or user not found", 401))
    }
    // if so, update password
    user.password = req.body.newPassword
    user.passwordConfirm = req.body.newPasswordConfirm
    await user.save()  // we didn't use findbyIdandUpdate  cuz it won't run validators then
    // log user in, send JWT

    createSendToken(user,200,res)
})

// only for render pages, no errors!!
exports.isLoggedIn = async (req,res,next) => {
    // get the token and check if it's there
    // validate token 
    // next
    if(req.cookies.jwt){
        try{
            const decoded = await promisify(jwt.verify)(
                req.cookies.jwt,
                process.env.JWT_SECRET
            )
            const currentUser = await User.findById(decoded.id)
            if (!currentUser){
                return next()
            }
            if (currentUser.changedPasswordAfter(decoded.iat)){
                return next()
            }
            res.locals.user = currentUser // logged in user in the pug template
            // console.log(currentUser)
            return next()
        }catch (err){
            return next()
        }
    }
    next()

}

exports.logout = (req,res) => {
    const cookieOptions = {
        expires: new Date(Date.now() + 150),
        httpOnly:true   // to prevent cross site scripting attacks
    }

    if (process.env.NODE_ENV === 'production'){cookieOptions.secure = true}

    res.cookie('jwt',"logged out", cookieOptions)
    res.status(200).json({
        status:"success"
    })
}