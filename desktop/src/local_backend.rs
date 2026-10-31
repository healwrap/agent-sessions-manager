use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::time::{Duration, Instant};

pub const URL: &str = "http://127.0.0.1:8766/";

fn request(method: &str, path: &str) -> Option<(u16, serde_json::Value)> {
    let address: SocketAddr = "127.0.0.1:8766".parse().ok()?;
    let timeout = Duration::from_secs(2);
    let mut stream = TcpStream::connect_timeout(&address, timeout).ok()?;
    stream.set_read_timeout(Some(timeout)).ok()?;
    stream.set_write_timeout(Some(timeout)).ok()?;
    let data = if method == "POST" {
        "Content-Type: application/json\r\nContent-Length: 2\r\n\r\n{}"
    } else {
        "\r\n"
    };
    stream
        .write_all(format!("{method} {path} HTTP/1.0\r\nHost: 127.0.0.1:8766\r\n{data}").as_bytes())
        .ok()?;
    let mut body = String::new();
    stream.take(8192).read_to_string(&mut body).ok()?;
    let (head, json) = body.split_once("\r\n\r\n")?;
    let code = head.split_whitespace().nth(1)?.parse().ok()?;
    Some((code, serde_json::from_str(json).ok()?))
}

fn response() -> Option<serde_json::Value> {
    request("GET", "/api/health").and_then(|(code, value)| (code == 200).then_some(value))
}

pub fn update_command(action: &str) -> Result<(), String> {
    let (code, value) = request("POST", &format!("/api/desktop-update/{action}"))
        .ok_or("无法确认后台状态，请重新启动应用后再安装更新")?;
    if code != 200 {
        return Err(value["error"]
            .as_str()
            .unwrap_or("后台尚不支持更新，请重新启动应用")
            .into());
    }
    Ok(())
}

pub fn available() -> bool {
    response().is_some_and(|value| {
        value["ready"] == true
            && value["application"] == "Agent Sessions"
            && value["manager_protocol"] == 4
            && value["shared_state"] == true
    })
}

pub fn wait_for_shutdown() {
    let deadline = Instant::now() + Duration::from_secs(12);
    while response().is_some() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(100));
    }
}
