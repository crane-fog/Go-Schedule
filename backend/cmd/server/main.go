package main

import (
	"schedule/internal/config"
	"schedule/internal/handler"
	"schedule/internal/router"
	"schedule/internal/schedule"
	"schedule/internal/storage"
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
	s := schedule.NewScheduleService(store)
	h := handler.NewScheduleHandler(s)
	r := router.NewRouter(router.Handlers{ScheduleHandler: h})

	if err := r.Run(cfg.Addr); err != nil{
		panic(err)
	}
}
