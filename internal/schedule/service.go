package schedule

import "schedule/internal/openapi"

type ScheduleService struct {
	store Store
}

func NewScheduleService(store Store) *ScheduleService {
	return &ScheduleService{store: store}
}

func (s *ScheduleService) GetSchedules() ([]openapi.Schedule, error) {
	return s.store.GetSchedules()
}

func (s *ScheduleService) CreateSchedule(req *openapi.CreateScheduleRequest) (*openapi.Schedule, error) {
	return s.store.CreateSchedule(req)
}

func (s *ScheduleService) UpdateSchedule(id int64, req *openapi.UpdateScheduleRequest) (*openapi.Schedule, error) {
	return s.store.UpdateSchedule(id, req)
}

func (s *ScheduleService) DeleteSchedule(id int64) (*openapi.DeleteScheduleResponseData, error) {
	err := s.store.DeleteSchedule(id)
	if err != nil {
		return nil, err
	}
	return &openapi.DeleteScheduleResponseData{Id: id}, nil
}
