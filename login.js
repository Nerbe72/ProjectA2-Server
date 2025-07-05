const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

// JWT 시크릿 키. 보안을 위해 설정 파일이나 환경 변수로 관리하는 것이 좋습니다.
const secretKey = 'testkey';

// 요청하신 구조에 따라, /users 경로의 POST, PUT 요청을 모두 처리하는 단일 함수입니다.
const login = function(req, res) {

    // POST 요청: 사용자 로그인 처리
    const handlePostRequest = () => {
        console.log('POST /users (login) 요청 수신');
        const { id, password } = req.body;

        // 'login.js'는 루트에, 'db.json'은 'users' 폴더 안에 있으므로, 올바른 경로를 설정합니다.
        const dbPath = path.join(__dirname, 'users', 'db.json');

        fs.readFile(dbPath, 'utf8', (err, data) => {
            if (err) {
                console.error('db.json 파일 읽기 오류:', err);
                return res.status(500).json({ message: '서버 내부 오류입니다.' });
            }

            try {
                const users = JSON.parse(data).users;
                const user = users.find(u => u.id === id && u.password === password);

                if (!user) {
                    return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
                }

                const token = jwt.sign({ userId: user.uid }, secretKey, { expiresIn: '1h' });

                return res.json({
                    success: true,
                    token: token,
                    uid: user.uid,
                    username: user.username
                });
            } catch (parseErr) {
                console.error('JSON 파싱 오류:', parseErr);
                return res.status(500).json({ message: '데이터 처리 중 오류가 발생했습니다.' });
            }
        });
    };

    // PUT 요청: 기능 추가를 위한 플레이스홀더
    const handlePutRequest = () => {
        console.log('PUT /users 요청 수신. 아직 구현되지 않은 기능입니다.');
        return res.status(501).json({ message: 'PUT 요청은 아직 구현되지 않았습니다.' });
    };

    // HTTP 메소드에 따라 적절한 핸들러를 호출합니다.
    switch (req.method.toUpperCase()) { // toUpperCase() 추가하여 소문자 메소드도 처리
        case 'POST':
            handlePostRequest();
            break;
        case 'PUT':
            handlePutRequest();
            break;
        default:
            // 허용되지 않은 메소드에 대한 응답
            res.setHeader('Allow', ['POST', 'PUT']);
            res.status(405).send(`Method ${req.method} Not Allowed`);
            break;
    }
};

module.exports.login = login;
