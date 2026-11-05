package handler

import (
	"errors"
	"schedule/internal/openapi"

	"github.com/gin-gonic/gin"
)

func writeJSON(c *gin.Context, data any) {
	c.JSON(200, data)
}

func writeError(c *gin.Context, err error) {
	var msg string
	if err == nil {
		msg = "no error but writeError called"
	} else {
		msg = err.Error()
	}
	var errResp openapi.ErrorResponse
	if errors.As(err, &errResp) {
		c.JSON(200, errResp)
		return
	}
	c.JSON(200, openapi.ErrorResponse{Code: 500, Data: openapi.ErrorResponseData{Message: msg}})
}

func writeErrorWithCode(c *gin.Context, code int32, message string) {
	c.JSON(200, openapi.ErrorResponse{Code: code, Data: openapi.ErrorResponseData{Message: message}})
}
