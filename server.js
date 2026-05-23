const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(cors());
app.use(express.json());

// เปิดทางให้หน้าเว็บดึงรูปภาพในโฟลเดอร์ uploads ไปแสดงผลได้
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// สร้างโฟลเดอร์ 'uploads' อัตโนมัติถ้ายังไม่มีในเครื่อง
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

// ตั้งค่า multer สำหรับเก็บรูปภาพ
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, './uploads'); },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// เชื่อมต่อฐานข้อมูล MySQL
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'school_complain'
});

db.connect((err) => {
    if (err) console.log('❌ เชื่อมต่อฐานข้อมูลไม่สำเร็จ:', err.message);
    else console.log('🚀 [Database] เชื่อมต่อสำเร็จ! รองรับรูปภาพและรหัสนักศึกษาเรียบร้อย');
});

// ตั้งค่าการส่งอีเมลผ่าน Gmail
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'talkansuda35@gmail.com',
        pass: 'flbinlvmamqijtid' 
    }
});

// 🌟 API บันทึกเรื่องร้องเรียน (เวอร์ชันปรับปรุง: รับ student_id แทนเบอร์โทร)
app.post('/api/complaints', upload.single('image'), (req, res) => {
    // รับค่า student_id มาจากหน้าบ้าน
    const { title, category, description, is_anonymous, reporter_name, student_id } = req.body;
    const anonymousValue = is_anonymous === 'true' || is_anonymous === '1' ? 1 : 0;
    const defaultStatus = 'รอการดำเนินการ';
    const imageName = req.file ? req.file.filename : null;

    // นำค่า student_id ไปบันทึกลงคอลัมน์ reporter_phone ในตารางเดิมได้เลย
    const sql = "INSERT INTO complaints (title, category, reporter_name, reporter_phone, description, image_path, is_anonymous, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    
    db.query(sql, [title, category, reporter_name, student_id, description, imageName, anonymousValue, defaultStatus], (err, result) => {
        if (err) {
            console.error('❌ [SQL Error]:', err.message);
            return res.status(500).json({ success: false, message: 'บันทึกข้อมูลผิดพลาด: ' + err.message });
        }

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

        // หน้าตาตารางในอีเมล แจ้งเตือนแอดมิน (เปลี่ยนเป็นหัวข้อ รหัสนักศึกษา)
        const mailOptions = {
            from: 'talkansuda35@gmail.com',
            to: 'talkansuda35@gmail.com',
            subject: '📢 มีเรื่องร้องเรียนใหม่จากคุณ ' + reporter_name + ' (รหัส: ' + student_id + ')',
            html: `
                <div style="font-family: 'Sarabun', sans-serif; max-width: 650px; border: 1px solid #e0e0e0; padding: 30px; border-radius: 12px; background-color: #ffffff; margin: 0 auto;">
                    <h2 style="color: #d32f2f; font-size: 22px; margin-top: 0; margin-bottom: 20px; font-weight: bold;">📢 ตรวจพบเรื่องร้องเรียนใหม่</h2>
                    
                    <table style="width: 100%; border-collapse: collapse; font-size: 15px; margin-bottom: 25px;">
                        <tr>
                            <td style="width: 25%; padding: 12px 15px; border: 1px solid #e0e0e0; font-weight: bold; background-color: #f9f9f9;">ชื่อผู้แจ้ง:</td>
                            <td style="padding: 12px 15px; border: 1px solid #e0e0e0; color: #1e3a8a; font-weight: bold;">${reporter_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 12px 15px; border: 1px solid #e0e0e0; font-weight: bold; background-color: #f9f9f9;">รหัสนักศึกษา:</td>
                            <td style="padding: 12px 15px; border: 1px solid #e0e0e0; color: #333;">${student_id}</td>
                        </tr>
                        <tr>
                            <td style="padding: 12px 15px; border: 1px solid #e0e0e0; font-weight: bold; background-color: #f9f9f9;">หัวข้อเรื่อง:</td>
                            <td style="padding: 12px 15px; border: 1px solid #e0e0e0; color: #333;">${title}</td>
                        </tr>
                        <tr>
                            <td style="padding: 12px 15px; border: 1px solid #e0e0e0; font-weight: bold; background-color: #f9f9f9;">หมวดหมู่:</td>
                            <td style="padding: 12px 15px; border: 1px solid #e0e0e0; color: #555;">📌 ${category}</td>
                        </tr>
                        <tr>
                            <td style="padding: 12px 15px; border: 1px solid #e0e0e0; font-weight: bold; background-color: #f9f9f9;">รายละเอียด:</td>
                            <td style="padding: 12px 15px; border: 1px solid #e0e0e0; color: #555; white-space: pre-line;">${description}</td>
                        </tr>
                        <tr>
                            <td style="padding: 12px 15px; border: 1px solid #e0e0e0; font-weight: bold; background-color: #f9f9f9;">ภาพประกอบ:</td>
                            <td style="padding: 12px 15px; border: 1px solid #e0e0e0;">${emailImageHTML}</td>
                        </tr>
                        <tr>
                            <td style="padding: 12px 15px; border: 1px solid #e0e0e0; font-weight: bold; background-color: #f9f9f9;">การแสดงตัวตน:</td>
                            <td style="padding: 12px 15px; border: 1px solid #e0e0e0; color: #555;">
                                ${anonymousValue ? '👤 ปกปิดตัวตน' : '🔓 เปิดเผยตัวตน'}
                            </td>
                        </tr>
                    </table>
                    
                    <p style="font-size: 13px; color: #888888; border-top: 1px solid #eeeeee; padding-top: 15px;">
                        ระบบแจ้งเตือนอัตโนมัติจากระบบโรงเรียน • ${new Date().toLocaleDateString('th-TH')}
                    </p>
                </div>
            `,
            attachments: mailAttachments
        };

        transporter.sendMail(mailOptions, (error) => {
            if (error) console.log('❌ ส่งเมลแจ้งเตือนไม่สำเร็จ:', error.message);
            else console.log('✅ ส่งเมลแจ้งเตือนพร้อมรหัสนักศึกษาสำเร็จแล้ว!');
        });

        res.json({ success: true, message: 'บันทึกข้อมูลเรียบร้อยแล้ว' });
    });
});

// API สำหรับดึงข้อมูลไปแสดงที่หน้าแอดมิน
app.get('/api/complaints', (req, res) => {
    db.query("SELECT * FROM complaints ORDER BY id DESC", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// API สำหรับอัปเดตสถานะเรื่องร้องเรียน
app.put('/api/complaints/:id/status', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    db.query("UPDATE complaints SET status = ? WHERE id = ?", [status, id], (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true });
    });
});

// API สำหรับเข้าสู่ระบบ (Login) ของแอดมิน
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === '1234') res.json({ success: true });
    else res.json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
});

// เปิดรันเซิร์ฟเวอร์หลังบ้าน พอร์ต 3000
app.listen(3000, () => {
    console.log('🟢 [Backend] เซิร์ฟเวอร์เวอร์ชันรหัสนักศึกษาพร้อมใช้งานแล้วที่ http://localhost:3000');
});