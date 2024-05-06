const AppError = require("../utils/appError")

const handleCastErrorDB =  err => {
    const message = `Invalid ${err.path}: ${err.value}`
    return new AppError(message, 400)
}
const handleDuplicateFieldsDB = err => {
    const value = err.keyValue.name
    const message = `Duplicate field value:${value}. Please use other value`
    return new AppError(message, 400)
}
const sendErrorDev = (err,res) => {
    res.status(err.statusCode).json({
        status:err.status,
        message:err.message,
        error:err,
        stack:err.stack
    })
}
const handleJWTError = () => {
    return new AppError('Invalid Token, login again', 500)
}
const handleJWTExpiredError = () => new AppError('token expired, please log in again', 500)
const handleValidationError = err => {
    const errors = Object.values(err.errors).map(el => el.message)

    const message = `Invalid input Data. ${errors.join('. \n')}`
    return new AppError(message, 400)
}

const sendErrorProd = (err , res) => {
    if (err.isOperational){
        res.status(err.statusCode).json({
            status:err.status,
            message:err.message
        })
    }else{   // programming or other unknown errors
        console.error('ERROR!!!!!!!!', err)  // error will be visible on heroku(hosting) platform
        res.status(500).json({
            status:'error',
            message:'something went very wrong'
        })
    }
}

module.exports = (err, req,res, next) => {  // defining 4 parameters, itself means that express knows that its a error middleware
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error'


    if(process.env.NODE_ENV === 'development'){
        sendErrorDev(err,res)
    }else if (process.env.NODE_ENV === 'production'){

        let error = {... err}
        if (error.name === 'CastError'){
            error = handleCastErrorDB(error)
        }
        if (error.code === 11000){
            error = handleDuplicateFieldsDB(error)
        }
        if (error.name === 'ValidatorError'){
            error = handleValidationError(error)
        }
        if (error.name === 'JsonWebTokenError'){
            error = handleJWTError()
        }
        if (error.name === 'TokenExpiredError'){
            error = handleJWTExpiredError()
        }
        sendErrorProd(error,res)
    }
}