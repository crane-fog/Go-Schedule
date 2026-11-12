package openapi

func (e *ErrorResponse) Error() string {
	return e.Data.Message
}
