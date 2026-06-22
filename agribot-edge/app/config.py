"""Typed settings loaded from environment / .env (see .env.example)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # HTTP server
    host: str = "0.0.0.0"
    port: int = 8000

    # Postgres
    database_url: str = "postgresql://agribot:agribot@localhost:5432/agribot_edge"

    # Camera + mic (Windows DirectShow device names)
    video_device: str = "Integrated Camera"
    audio_device: str = "Microphone Array"
    media_format: str = "dshow"

    # Stream tuning — lower = less to encode/relay/buffer = lower latency (good for
    # driving over a remote/TURN path). Bump back up when on the LAN if you want.
    video_width: int = 640
    video_height: int = 360
    video_framerate: int = 20

    # WebRTC ICE
    stun_url: str = "stun:stun.l.google.com:19302"
    turn_url: str = ""
    turn_username: str = ""
    turn_password: str = ""

    # Local MQTT broker
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_sensors_topic: str = "agribot/sensors"

    # Supabase sync
    supabase_url: str = ""
    supabase_service_key: str = ""
    sync_interval_s: int = 30


settings = Settings()
