package openapi

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
)

func (r Recurrence) Value() (driver.Value, error) {
	return json.Marshal(r)
}

func (r *Recurrence) Scan(value interface{}) error {
	if value == nil {
		return nil
	}
	var bytes []byte
	switch v := value.(type) {
	case []byte:
		bytes = v
	case string:
		bytes = []byte(v)
	default:
		return errors.New("failed to unmarshal Recurrence value")
	}
	return json.Unmarshal(bytes, r)
}
