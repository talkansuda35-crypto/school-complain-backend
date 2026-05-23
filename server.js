const express = require('express');
const pg = require('pg'); 
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const app = express();

app.use(cors());
app.use(express.json());

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, './uploads'); },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// เชื่อมต่อฐานข้อมูล PostgreSQL ผ่าน Environment Variable
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ดักจับ Error ระดับ Global ของ Pool ไม่ให้เซิร์ฟเวอร์ค้าง
pool.on('error', (err) => {
    console.error('❌ [PostgreSQL Unexpected Error]:', err.message);
});

// ตั้งค่าการส่งอีเมลผ่าน Gmail
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'talkansuda35@gmail.com',
        pass: 'flbinlvmamqijtid' 
    }
});

// API บันทึกเรื่องร้องเรียน (รองรับทั้งตารางที่มีคอลัมน์ reporter_phone หรือ student_id)
app.post('/api/complaints', upload.single('image'), async (req, res) => {
    const { title, category, description, is_anonymous, reporter_name, student_id } = req.body;
    const anonymousValue = is_anonymous === 'true' || is_anonymous === '1' ? 1 : 0;
    const defaultStatus = 'รอการดำเนินการ';
    const imageName = req.file ? req.file.filename : null;

    try {
        // ค้นหาชื่อคอลัมน์จริงในฐานข้อมูลก่อนว่าใช้ชื่ออะไร เพื่อป้องกัน SQL พัง
        const tableCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'complaints' AND column_name = 'reporter_phone'
        `);
        
        const phoneColumn = tableCheck.rows.length > 0 ? 'reporter_phone' : 'student_id';
        
        const sql = `INSERT INTO complaints (title, category, reporter_name, ${phoneColumn}, description, image_path, is_anonymous, status) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
        
        await pool.query(sql, [title, category, reporter_name, student_id, description, imageName, anonymousValue, defaultStatus]);

        // จัดการไฟล์แนบในอีเมล
        let mailAttachments = [];
        let emailImageHTML = `<p style="color: #888;"><i>(ไม่มีภาพแนบประกอบ)</i></p>`;

        if (imageName) {
            mailAttachments.push({
                filename: imageName,
                path: path.join(__dirname, 'uploads', imageName),
                cid: 'complaint_image'
            });
            emailImageHTML = `<img src="cid:complaint_image" style="max-width: 100%; border-radius: 8px; margin-top: 10px; border: 1px solid #ddd;" />`;
        }

        const mailOptions = {
            from: 'talkansuda35@gmail.com',
            to: 'talkansuda35@gmail.com',
            subject: '📢 มีเรื่องร้องเรียนใหม่จากคุณ ' + reporter_name + ' (รหัส: ' + student_id + ')',
            html: `
                <div style="font-family: 'Sarabun', sans-serif; max-width: 650px; border: 1px solid #e0e0e0; padding: 30px; border-radius: 12px; background-color: #ffffff; margin: 0 auto;">
                    <h2 style="color: #d32f2f; font-size: 22px; margin-top: 0; margin-bottom: 20px; font-weight: bold;">📢 ตรวจพบเรื่องร้องเรียนใหม่</h2>
                    <table style="width: 100%; border-collapse: collapse; font-size: 15px; margin-bottom: 25px;">
                        <tr><td style="width: 25%; padding: 12px 15px; border: 1px solid #e0e0e0; font-weight: bold; background-color: #f9f9f9;">ชื่อผู้แจ้ง:</td><td style="padding: 12px 15px; border: 1px solid #e0e0e0; color: #1e3a8a; font-weight: bold;">\${reporter_name}</td></tr>
                        <tr><td style="padding: 12px 15px; border: 1px solid #e0e0e0; font-weight: bold; background-color: #f9f9f9;">รหัสนักศึกษา:</td><td style="padding: 12px 15px; border: 1px solid #e0e0e0; color: #333;">\${student_id}</td></tr>
                        <tr><td style="padding: 12px 15px; border: 1px solid #e0e0e0; font-weight: bold; background-color: #f9f9f9;">หัวข้อเรื่อง:</td><td style="padding: 12px 15px; border: 1px solid #e0e0e0; color: #333;">\${title}</td></tr>
                        <tr><td style="padding: 12px 15px; border: 1px solid #e0e0e0; font-weight: bold; background-color: #f9f9f9;">หมวดหมู่:</td><td style="padding: 12px 15px; border: 1px solid #e0e0e0; color: #555;">📌 \${category}</td></tr>
                        <tr><td style="padding: 12px 15px; border: 1px solid #e0e0e0; font-weight: bold; background-color: #f9f9f9;">รายละเอียด:</td><td style="padding: 12px 15px; border: 1px solid #e0e0e0; color: #555; white-space: pre-line;">\${description}</td></tr>
                        <tr><td style="padding: 12px 15px; border: 1px solid #e0e0e0; font-weight: bold; background-color: #f9f9f9;">ภาพประกอบ:</td><td style="padding: 12px 15px; border: 1px solid #e0e0e0;">\${emailImageHTML}</td></tr>
                        <tr><td style="padding: 12px 15px; border: 1px solid #e0e0e0; font-weight: bold; background-color: #f9f9f9;">การแสดงตัวตน:</td><td style="padding: 12px 15px; border: 1px solid #e0e0e0; color: #555;">\${anonymousValue ? '👤 ปกปิดตัวตน' : '🔓 เปิดเผยตัวตน'}</td></tr>
                    </table>
                </div>
            `,
            attachments: mailAttachments
        };

        transporter.sendMail(mailOptions, (error) => {
            if (error) console.log('❌ ส่งเมลแจ้งเตือนไม่สำเร็จ:', error.message);
            else console.log('✅ ส่งเมลแจ้งเตือนพร้อมรหัสนักศึกษาสำเร็จแล้ว!');
        });

        res.json({ success: true, message: 'บันทึกข้อมูลเรียบร้อยแล้ว' });

    } catch (err) {
        console.error('❌ [API Error]:', err.message);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบฐานข้อมูล' });
    }
});

// API สำหรับดึงข้อมูลไปแสดงที่หน้าแอดมิน (สร้างตารางดักไว้เผื่อไม่มีตาราง)
app.get('/api/complaints', async (req, res) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS complaints (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                category VARCHAR(255) NOT NULL,
                reporter_name VARCHAR(255),
                reporter_phone VARCHAR(255),
                description TEXT,
                image_path VARCHAR(255),
                is_anonymous INT DEFAULT 0,
                status VARCHAR(50) DEFAULT 'รอการดำเนินการ',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        const results = await pool.query("SELECT * FROM complaints ORDER BY id DESC");
        res.json(results.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API สำหรับอัปเดตสถานะเรื่องร้องเรียน
app.put('/api/complaints/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        await pool.query("UPDATE complaints SET status = $1 WHERE id = $2", [status, id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// API สำหรับเข้าสู่ระบบ (Login) ของแอดมิน
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === '1234') res.json({ success: true });
    else res.json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
});

// ตรวจสอบการเปิดใช้งานและรันเซิร์ฟเวอร์
app.listen(3000, () => {
    console.log('🟢 [Backend] เซิร์ฟเวอร์เวอร์ชัน PostgreSQL ทำงานสมบูรณ์แล้วบนพอร์ต 3000');
});
