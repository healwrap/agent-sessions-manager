use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::time::{Duration, Instant};

pub const URL: &str = "http://127.0.0.1:8766/";

fn response() -> Option<serde_json::Value> {
    let address: SocketAddr = "127.0.0.1:8766".parse().ok()?;
    let timeout = Duration::from_millis(300);
    let mut stream = TcpStream::connect_timeout(&address, timeout).ok()?;
    stream.set_read_timeout(Some(timeout)).ok()?;
    stream.set_write_timeout(Some(timeout)).ok()?;
    stream
        .write_all(b"GET /api/health HTTP/1.0\r\nHost: 127.0.0.1:8766\r\n\r\n")
        .ok()?;
    let mut body = String::new();
    stream.take(8192).read_to_string(&mut body).ok()?;
    let (head, json) = body.split_once("\r\n\r\n")?;
    if !head.starts_with("HTTP/1.0 200") && !head.starts_with("HTTP/1.1 200") {
        return None;
    }
    serde_json::from_str(json).ok()
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
