package handler

import (
	"schedule/internal/openapi"
	"strconv"

	"github.com/gin-gonic/gin"
)

type ScheduleService interface {
	GetSchedules() ([]openapi.Schedule, error)
	CreateSchedule(req *openapi.CreateScheduleRequest) (*openapi.Schedule, error)
	UpdateSchedule(id int64, req *openapi.UpdateScheduleRequest) (*openapi.Schedule, error)
	DeleteSchedule(id int64) (*openapi.DeleteScheduleResponseData, error)
}

type ScheduleHandler struct {
    scheduleService ScheduleService
}

func NewScheduleHandler(s ScheduleService) *ScheduleHandler {
	return &ScheduleHandler{scheduleService: s}
}

func (h *ScheduleHandler) RegisterRoutes(rg *gin.RouterGroup) {
	schedules := rg.Group("/schedules")
	{
		schedules.GET("", h.GetSchedules)
		schedules.POST("", h.CreateSchedule)
		schedules.PUT("/:id", h.UpdateSchedule)
		schedules.DELETE("/:id", h.DeleteSchedule)
	}
}

func (h *ScheduleHandler) GetSchedules(c *gin.Context) {
	result, err := h.scheduleService.GetSchedules()
	if err != nil {
		writeError(c, err)
		return
	}
	writeJSON(c, openapi.ScheduleListResponse{Code: 200, Data: result})
}

func (h *ScheduleHandler) CreateSchedule(c *gin.Context) {
	var req openapi.CreateScheduleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeErrorWithCode(c, 400, "Invalid request")
		return
	}
	data, err := h.scheduleService.CreateSchedule(&req)
	if err != nil {
		writeError(c, err)
		return
	}
	writeJSON(c, openapi.ScheduleResponse{Code: 200, Data: *data})
}

func (h *ScheduleHandler) UpdateSchedule(c *gin.Context) {
	var req openapi.UpdateScheduleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeErrorWithCode(c, 400, "Invalid request")
		return
	}
	var idStr string = c.Param("id")
	if idStr == "" {
		writeErrorWithCode(c, 400, "Missing schedule ID")
		return
	}
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeErrorWithCode(c, 400, "Invalid schedule ID format")
		return
	}
	data, err := h.scheduleService.UpdateSchedule(id, &req)
	if err != nil {
		writeError(c, err)
		return
	}
	writeJSON(c, openapi.ScheduleResponse{Code: 200, Data: *data})
}

func (h *ScheduleHandler) DeleteSchedule(c *gin.Context) {
	var idStr string = c.Param("id")
	if idStr == "" {
		writeErrorWithCode(c, 400, "Missing schedule ID")
		return
	}
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeErrorWithCode(c, 400, "Invalid schedule ID format")
		return
	}
	data, err := h.scheduleService.DeleteSchedule(id)
	if err != nil {
		writeError(c, err)
		return
	}
	writeJSON(c, openapi.DeleteScheduleResponse{Code: 200, Data: *data})
}
