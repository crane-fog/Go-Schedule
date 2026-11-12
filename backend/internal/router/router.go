package router

import (
	"net/http"

	"schedule/internal/handler"

	"github.com/gin-gonic/gin"
)

type Handlers struct {
	ScheduleHandler *handler.ScheduleHandler
}

func NewRouter(h Handlers) *gin.Engine {
	r := gin.New()

	r.Use(gin.Logger())
	r.Use(gin.Recovery())

	r.GET("/ping", func(c *gin.Context) {
		c.String(http.StatusOK, "pong")
	})

	v1 := r.Group("/api/v1")
	{
		// public := v1.Group("")
		protected := v1.Group("")
		{
			// protected.Use(middleware.AuthMiddleware())
			h.ScheduleHandler.RegisterRoutes(protected)
		}
	}

	return r
}
