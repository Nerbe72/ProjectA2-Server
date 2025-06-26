// server.js
const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 3000;
const secretKey = 'testkey';

// 정적 파일 제공 (예: 클라이언트 HTML/JS 파일들을 담은 public 폴더)
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

app.post('/login', (req, res) => {
    const { id, password } = req.body;

    // db.json 파일에서 사용자 정보 읽어오기
    fs.readFile('./db.json', 'utf8', (err, data) => {
        if (err) {
            console.error('파일 읽기 에러:', err);
            return res.status(500).json({ message: '서버 에러' });
        }

        const users = JSON.parse(data).users;
        const user = users.find(u => u.id === id && u.password === password);

        if (!user) {
            return res.status(401).json({ success: false, message: '아이디 혹은 비밀번호가 틀렸습니다.' });
        }

        // 로그인 성공 시 JWT 토큰 발급 (토큰에 userId 포함)
        const token = jwt.sign({ userId: user.uid }, secretKey, { expiresIn: '1h' });

        // 반환 정보: success, token, userId
        return res.json({
            success: true,
            token: token,
            uid: user.uid,
            username: user.username
        });
    });
});

// 토큰 검증 미들웨어
function verifyToken(req, res, next) {
    const bearerHeader = req.headers['authorization'];
    if (!bearerHeader) {
        return res.status(403).json({ message: '토큰이 제공되지 않았습니다.' });
    }

    const token = bearerHeader.split(' ')[1]; // "Bearer {token}" 형식
    jwt.verify(token, secretKey, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: '유효하지 않은 토큰입니다.' });
        }
        // 토큰에 저장된 userId를 req 객체에 저장
        req.userId = decoded.userId;
        next();
    });
}

// 배너 데이터
app.post('/banners', (req, res) => {
    const filePath = path.join(__dirname, 'banners.json');
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('배너 파일 읽기 에러:', err);
            return res.status(500).json({ error: '배너 정보를 불러올 수 없습니다.' });
        }
        try {
            const bannerData = JSON.parse(data);
            res.json(bannerData);
        } catch (parseErr) {
            console.error('배너 JSON 파싱 에러:', parseErr);
            return res.status(500).json({ error: '잘못된 배너 데이터 형식입니다.' });
        }
    });
});

// 전역 게임 상태 객체 (플레이어, 보스, 몬스터)
let players = {}; // { socketId: { id, x, y, action } }
let bosses = {
    id: "boss1",
    x: 400,
    y: 300,
    hp: 1000,
    // 간단한 이동을 위한 속성 (1: 오른쪽, -1: 왼쪽)
    direction: 1
};
let monsters = {}; // 필요 시 여러 몬스터 상태 관리

// 게임 루프 TICK_RATE (예: 20 FPS)
const TICK_RATE = 1000 / 20;

// 게임 루프: 보스/몬스터 업데이트 후 전체 상태를 모든 클라이언트에 브로드캐스트
function gameLoop() {
    updateBossesAndMonsters();

    io.sockets.emit('state', {
        players,
        bosses,
        monsters
    });
}

// 보스, 몬스터 업데이트 함수 예시
function updateBossesAndMonsters() {
    const bossSpeed = 2;
    bosses.x += bosses.direction * bossSpeed;
    if (bosses.x > 800 || bosses.x < 200) {
        // 경계에 도달하면 이동 방향 전환
        bosses.direction *= -1;
    }
    // 몬스터 로직은 필요에 따라 추가
}

// Socket.IO를 이용한 플레이어 연결 처리
io.on('connection', (socket) => {
    console.log('플레이어 접속:', socket.id);

    // 새로운 플레이어 초기 상태 설정
    players[socket.id] = {
        id: socket.id,
        x: 100, // 초기 위치
        y: 100,
        action: null // 예: "idle", "running", "attacking" 등
    };

    // 클라이언트가 플레이어 이동/동작 정보를 보낼 경우
    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].action = data.action || null;
        }
    });

    // 클라이언트에서 공격 이벤트가 발생할 경우 (예: 보스 공격)
    socket.on('attack', (data) => {
        // data 예시: { targetType: 'boss', damage: 20 }
        if (data.targetType === 'boss') {
            const damage = data.damage || 10;
            bosses.hp = Math.max(bosses.hp - damage, 0);
            // 공격 결과를 모든 클라이언트에 전파
            io.sockets.emit('bossDamage', {
                bossId: bosses.id,
                damage,
                newHp: bosses.hp
            });
        }
        // 몬스터 공격 로직은 필요에 따라 추가
    });

    // 클라이언트 연결 종료 시 해당 플레이어 정보 삭제
    socket.on('disconnect', () => {
        console.log('플레이어 종료:', socket.id);
        delete players[socket.id];
    });
});

app.post('/writegachalog', verifyToken, (req, res) => {
    const wrapper = req.body;

    if (!wrapper || !Array.isArray(wrapper.GachaResultList)) {
        console.log("유효하지 않은 데이터 형식이 들어옴(가챠로그)");
        return res.status(400).json({ message: '유효하지 않은 데이터 형식' });
    }

    let ndjson = "";
    wrapper.GachaResultList.forEach(result => {
        ndjson += JSON.stringify(result) + '\n';
    });

    const fileName = './' + req.userId + '/gachalog.json';
    console.log(fileName + "파일이 있나?");

    fs.access(fileName, fs.constants.F_OK, (accessErr) => {
        if (accessErr) {
            fs.writeFile(fileName, '', (writeErr) => {
                if (writeErr) {
                    console.error('파일 생성 실패', writeErr);
                    return res.status(500).json({ message: '새 파일 작성 실패' });
                }
                // 파일 생성 후 append 진행
                fs.appendFile(fileName, ndjson, (appendErr) => {
                    if (appendErr) {
                        console.error('로그 붙이기 실패', appendErr);
                        return res.status(500).json({ message: '로그 붙이기 실패' });
                    }
                    res.json({ message: '로그 저장 완료' });
                });
            });
        } else {
            // 파일이 이미 있으면 append만 진행
            fs.appendFile(fileName, ndjson, (appendErr) => {
                if (appendErr) {
                    console.error('로그 붙이기 실패', appendErr);
                    return res.status(500).json({ message: '로그 붙이기 실패' });
                }
                res.json({ message: '로그 저장 완료' });
            });
        }
    });
});

// 가챠로그 조회 엔드포인트 (GET → POST)
app.post('/gachalog', verifyToken, (req, res) => {
    const fileName = './' + req.userId + '/gachalog.json';
    fs.readFile(fileName, 'utf8', (err, data) => {
        if (err) {
            // 파일이 없으면 빈 배열 반환
            if (err.code === 'ENOENT') {
                return res.json([]);
            }
            console.error('가챠로그 파일 읽기 실패', err);
            return res.status(500).json({ message: '가챠로그 파일 읽기 실패' });
        }
        // NDJSON 파싱
        const lines = data.split('\n').filter(line => line.trim().length > 0);
        const logs = lines.map(line => {
            try {
                return JSON.parse(line);
            } catch (e) {
                return null;
            }
        }).filter(x => x !== null);
        res.json(logs);
    });
});

app.post('/readgachalog', verifyToken, (req, res) => {
    const fileName = './' + req.userId + '/gachalog.json';
    fs.readFile(fileName, 'utf8', (err, data) => {
        let resultList = [];
        if (err) {
            // 파일이 없으면 빈 파일 생성
            if (err.code === 'ENOENT') {
                fs.mkdir('./' + req.userId, { recursive: true }, (mkErr) => {
                    if (mkErr) {
                        return res.status(500).json({ message: '폴더 생성 실패' });
                    }
                    fs.writeFile(fileName, '', (writeErr) => {
                        if (writeErr) {
                            return res.status(500).json({ message: '빈 파일 생성 실패' });
                        }
                        // 빈 배열 반환
                        return res.json({ GachaResultList: [] });
                    });
                });
                return;
            } else {
                return res.status(500).json({ message: '파일 읽기 실패' });
            }
        }
        // NDJSON 파싱
        const lines = data.split('\n').filter(line => line.trim().length > 0);
        resultList = lines.map(line => {
            try {
                return JSON.parse(line);
            } catch (e) {
                return null;
            }
        }).filter(x => x !== null);
        // GachaResultWrapper 형태로 반환
        res.json({ GachaResultList: resultList });
    });
});

// 퀘스트 데이터
app.post('/quests', (req, res) => {
    const filePath = path.join(__dirname, 'quests.json');
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('퀘스트 파일 읽기 실패:', err);
            return res.status(500).json({ error: '퀘스트 정보를 불러올 수 없습니다.' });
        }
        try {
            const bannerData = JSON.parse(data);
            res.json(bannerData);
        } catch (parseErr) {
            console.error('퀘스트 JSON 파싱 에러:', parseErr);
            return res.status(500).json({ error: '잘못된 퀘스트 형식입니다.' });
        }
    });
});

// 정해진 틱마다 게임 루프 실행
setInterval(gameLoop, TICK_RATE);

// 서버 시작
server.listen(PORT, () => {
    console.log(`서버 실행 중: 포트 ${PORT}`);
});
