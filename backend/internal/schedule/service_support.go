package schedule

import (
	"errors"
	"sort"
	"strings"
	"time"

	"schedule/internal/openapi"
	"schedule/internal/storage"
)

const (
	typeOneTime   = "one_time"
	typeTimeRange = "time_range"
	typeRecurring = "recurring"
)

func validateCreate(req *openapi.CreateScheduleRequest) error {
	if err := validateTitleAndType(req.Title, req.Type); err != nil {
		return err
	}
	return validateTypeFields(req.Type, req.HappenTime, req.StartAt, req.EndAt, req.Recurrence)
}

func validateUpdate(req *openapi.UpdateScheduleRequest) error {
	if err := validateTitleAndType(req.Title, req.Type); err != nil {
		return err
	}
	return validateTypeFields(req.Type, req.HappenTime, req.StartAt, req.EndAt, req.Recurrence)
}

func validateTitleAndType(title, typ string) error {
	if strings.TrimSpace(title) == "" {
		return badRequest("title 不能为空")
	}
	switch typ {
	case typeOneTime, typeTimeRange, typeRecurring:
		return nil
	default:
		return badRequest("type 必须是 one_time、time_range 或 recurring")
	}
}

func validateTypeFields(typ string, happenTime, startAt, endAt *time.Time, recurrence *openapi.Recurrence) error {
	switch typ {
	case typeOneTime:
		if happenTime == nil {
			return badRequest("one_time 类型必须提供 happen_time")
		}
	case typeTimeRange:
		if startAt == nil || endAt == nil {
			return badRequest("time_range 类型必须提供 start_at 和 end_at")
		}
		if endAt.Before(*startAt) {
			return badRequest("end_at 不能早于 start_at")
		}
	case typeRecurring:
		if recurrence == nil {
			return badRequest("recurring 类型必须提供 recurrence")
		}
		if err := validateRecurrence(recurrence); err != nil {
			return err
		}
	}
	return nil
}

func validateRecurrence(r *openapi.Recurrence) error {
	switch r.Frequency {
	case "daily", "weekly", "monthly", "yearly":
	default:
		return badRequest("recurrence.frequency 必须是 daily、weekly、monthly 或 yearly")
	}
	if r.Interval < 0 {
		return badRequest("recurrence.interval 不能为负数")
	}
	if r.StartAt.IsZero() {
		return badRequest("recurrence.start_at 不能为空")
	}
	if r.Until != nil && !r.Until.After(r.StartAt) {
		return badRequest("recurrence.until 必须晚于 recurrence.start_at")
	}
	if r.Count != nil && *r.Count < 1 {
		return badRequest("recurrence.count 必须大于等于 1")
	}
	if r.DayOfWeek < 0 || r.DayOfWeek > 6 {
		return badRequest("recurrence.day_of_week 必须在 0 到 6 之间")
	}
	if r.DayOfMonth < 0 || r.DayOfMonth > 31 {
		return badRequest("recurrence.day_of_month 必须在 1 到 31 之间（0 表示未设置）")
	}
	if r.Month < 0 || r.Month > 12 {
		return badRequest("recurrence.month 必须在 1 到 12 之间（0 表示未设置）")
	}
	return nil
}

// 清空当前类型不使用的字段，并把 recurrence.interval 的默认值补成 1。
func normalizeTypeFields(typ string, happenTime, startAt, endAt **time.Time, recurrence **openapi.Recurrence) {
	switch typ {
	case typeOneTime:
		*startAt, *endAt, *recurrence = nil, nil, nil
	case typeTimeRange:
		*happenTime, *recurrence = nil, nil
	case typeRecurring:
		*happenTime, *startAt, *endAt = nil, nil, nil
		if *recurrence != nil && (*recurrence).Interval == 0 {
			(*recurrence).Interval = 1
		}
	}
}

// 按 one_time 的 happen_time 判断是否已完成。
func isOneTimeDone(happenTime *time.Time, now time.Time) bool {
	return happenTime != nil && !happenTime.After(now)
}

func applyDerivedDone(schedule *openapi.Schedule, now time.Time) {
	if schedule.Type == typeOneTime {
		schedule.Done = isOneTimeDone(schedule.HappenTime, now)
	}
}

// 按未完成在前、开始时间升序、优先级降序排序。
func sortSchedules(list []openapi.Schedule) {
	sort.SliceStable(list, func(i, j int) bool {
		a, b := &list[i], &list[j]
		if a.Done != b.Done {
			return !a.Done
		}

		aStart, aOK := scheduleStart(a)
		bStart, bOK := scheduleStart(b)
		switch {
		case aOK && bOK:
			if !aStart.Equal(bStart) {
				return aStart.Before(bStart)
			}
		case aOK != bOK:
			return aOK
		}

		if a.Priority != b.Priority {
			return a.Priority > b.Priority
		}
		return a.Id < b.Id
	})
}

func scheduleStart(s *openapi.Schedule) (time.Time, bool) {
	switch s.Type {
	case typeOneTime:
		if s.HappenTime != nil {
			return *s.HappenTime, true
		}
	case typeTimeRange:
		if s.StartAt != nil {
			return *s.StartAt, true
		}
	case typeRecurring:
		if s.Recurrence != nil {
			return s.Recurrence.StartAt, true
		}
	}
	return time.Time{}, false
}

func badRequest(message string) error {
	return &openapi.ErrorResponse{Code: 400, Data: openapi.ErrorResponseData{Message: message}}
}

func notFound(message string) error {
	return &openapi.ErrorResponse{Code: 404, Data: openapi.ErrorResponseData{Message: message}}
}

func mapStoreError(err error) error {
	if errors.Is(err, storage.ErrNotFound) {
		return notFound("日程不存在")
	}
	return err
}
