package main

import (
	"os"
	"schedule/internal/config"
	"schedule/internal/handler"
	"schedule/internal/note"
	"schedule/internal/router"
	"schedule/internal/schedule"
	"schedule/internal/storage"
	"strings"
)

func main() {
	// 读取配置
	path := "config.toml"
	cfg, err := config.Load(path)
	if err != nil {
		panic(err)
	}

	// 连接数据库
	store, err := storage.NewSQLiteStore(cfg.DBPath)
	if err != nil {
		panic(err)
	}
	defer store.Close()

	// 组装业务层和 HTTP 层
	imagePath := strings.TrimSpace(cfg.ImagePath)
	if err := os.MkdirAll(imagePath, 0o755); err != nil {
		panic(err)
	}
	s := schedule.NewScheduleService(store)
	n := note.NewNoteService(store, imagePath)
	sh := handler.NewScheduleHandler(s)
	nh := handler.NewNoteHandler(n)
	r := router.NewRouter(router.Handlers{ScheduleHandler: sh, NoteHandler: nh})

	if err := r.Run(cfg.Addr); err != nil {
		panic(err)
	}
}
