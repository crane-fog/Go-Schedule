package schedule

import (
	"time"

	"schedule/internal/openapi"
)

type ScheduleService struct {
	store Store
}

func NewScheduleService(store Store) *ScheduleService {
	return &ScheduleService{store: store}
}

func (s *ScheduleService) GetSchedules() ([]openapi.Schedule, error) {
	list, err := s.store.GetSchedules()
	if err != nil {
		return nil, err
	}

	now := time.Now()
	for i := range list {
		applyDerivedDone(&list[i], now)
	}
	sortSchedules(list)
	return list, nil
}

func (s *ScheduleService) CreateSchedule(req *openapi.CreateScheduleRequest) (*openapi.Schedule, error) {
	if err := validateCreate(req); err != nil {
		return nil, err
	}
	normalizeTypeFields(req.Type, &req.HappenTime, &req.StartAt, &req.EndAt, &req.Recurrence)

	result, err := s.store.CreateSchedule(req)
	if err != nil {
		return nil, err
	}
	applyDerivedDone(result, time.Now())
	return result, nil
}

func (s *ScheduleService) UpdateSchedule(id int64, req *openapi.UpdateScheduleRequest) (*openapi.Schedule, error) {
	if id < 1 {
		return nil, badRequest("Invalid schedule ID")
	}
	if err := validateUpdate(req); err != nil {
		return nil, err
	}
	normalizeTypeFields(req.Type, &req.HappenTime, &req.StartAt, &req.EndAt, &req.Recurrence)
	if req.Type == typeOneTime {
		req.Done = isOneTimeDone(req.HappenTime, time.Now())
	}

	result, err := s.store.UpdateSchedule(id, req)
	if err != nil {
		return nil, mapStoreError(err)
	}
	applyDerivedDone(result, time.Now())
	return result, nil
}

func (s *ScheduleService) DeleteSchedule(id int64) (*openapi.DeleteScheduleResponseData, error) {
	if id < 1 {
		return nil, badRequest("Invalid schedule ID")
	}
	if err := s.store.DeleteSchedule(id); err != nil {
		return nil, mapStoreError(err)
	}
	return &openapi.DeleteScheduleResponseData{Id: id}, nil
}
