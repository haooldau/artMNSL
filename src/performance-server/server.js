// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// 启用 CORS 和 JSON 解析
app.use(cors({
  origin: ['http://localhost:3002', 'http://localhost:3000', 'https://*.zeabur.app'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));
app.use(express.json());

// 配置文件上传
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/') // 确保这个目录存在
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 限制 5MB
  },
  fileFilter: function (req, file, cb) {
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
      return cb(new Error('只允许上传图片文件！'));
    }
    cb(null, true);
  }
});

// 静态文件服务
app.use('/api/uploads', express.static(path.join(__dirname, 'public/uploads')));

// 数据库连接配置
const dbConfig = {
  host: process.env.DB_HOST || 'hkg1.clusters.zeabur.com',
  port: process.env.DB_PORT || 32710,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '74R6z2n891KemMJrjQ3OcT5uwkYE0HgV',
  database: process.env.DB_NAME || 'zeabur',
  ssl: {
    rejectUnauthorized: false
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// 创建连接池
const pool = mysql.createPool(dbConfig);

// 在创建连接池后添加测试连接代码
pool.getConnection()
  .then(connection => {
    console.log('数据库连接成功！');
    console.log('数据库配置:', {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      database: process.env.DB_NAME
    });
    connection.release();
  })
  .catch(err => {
    console.error('数据库连接失败:', err);
    console.error('数据库配置:', {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      database: process.env.DB_NAME
    });
  });

// 添加更详细的错误处理
pool.on('error', (err) => {
  console.error('数据库池错误:', err);
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.error('数据库连接丢失');
  }
});

// 测试路由 - 检查服务器状态
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', message: '服务器运行正常' });
});

// 在现有路由之前添加
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API is working',
    timestamp: new Date().toISOString()
  });
});

// 添加错误处理中间件
app.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(500).json({
    success: false,
    message: err.message || '服务器内部错误'
  });
});

// 添加演出信息
app.post('/api/performances', upload.single('poster'), async (req, res) => {
  try {
    console.log('接收到的数据:', req.body);
    console.log('接收到的文件:', req.file);

    const data = {
      artist: req.body.artist || null,
      type: req.body.type || null,
      province: req.body.province || null,
      city: req.body.city || null,
      venue: req.body.venue || null,
      notes: req.body.notes || null,
      date: req.body.date || null,
      poster: req.file ? `/api/uploads/${req.file.filename}` : null
    };

    // 验证必填字段
    if (!data.artist || !data.type || !data.province) {
      return res.status(400).json({
        success: false,
        message: '艺人、演出类型和省份是必填字段'
      });
    }

    const [result] = await pool.execute(
      'INSERT INTO performances (artist, type, province, city, venue, notes, date, poster) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [data.artist, data.type, data.province, data.city, data.venue, data.notes, data.date, data.poster]
    );

    console.log('插入结果:', result);

    res.json({ 
      success: true, 
      message: '数据提交成功',
      data: result
    });
  } catch (error) {
    console.error('数据库错误:', error);
    res.status(500).json({ 
      success: false, 
      message: '服务器错误：' + error.message 
    });
  }
});

// 获取所有演出信息
app.get('/api/performances', async (req, res) => {
  try {
    console.log('收到获取演出数据请求');
    
    const [rows] = await pool.execute('SELECT * FROM performances ORDER BY created_at DESC');
    console.log(`查询到 ${rows.length} 条记录`);
    
    if (rows.length > 0) {
      console.log('数据示例:', rows[0]);
    }

    res.json({ 
      success: true, 
      data: rows 
    });
  } catch (error) {
    console.error('获取数据错误:', error);
    res.status(500).json({ 
      success: false, 
      message: '服务器错误：' + error.message 
    });
  }
});

// 按省份获取演出信息
app.get('/api/performances/province/:province', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT *, DATE_FORMAT(created_at, "%Y-%m-%d") as formatted_date FROM performances WHERE province = ? ORDER BY created_at DESC',
      [req.params.province]
    );
    res.json({ 
      success: true, 
      data: rows 
    });
  } catch (error) {
    console.error('获取省份数据错误:', error);
    res.status(500).json({ 
      success: false, 
      message: '服务器错误：' + error.message 
    });
  }
});

// 按艺人获取演出信息
app.get('/api/performances/artist/:artist', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT *, DATE_FORMAT(created_at, "%Y-%m-%d") as formatted_date FROM performances WHERE artist = ? ORDER BY date DESC',
      [req.params.artist]
    );
    res.json({ 
      success: true, 
      data: rows 
    });
  } catch (error) {
    console.error('获取艺人数据错误:', error);
    res.status(500).json({ 
      success: false, 
      message: '服务器错误：' + error.message 
    });
  }
});

// 删除演出信息
app.delete('/api/performances/:id', async (req, res) => {
  try {
    const [result] = await pool.execute(
      'DELETE FROM performances WHERE id = ?',
      [req.params.id]
    );
    
    if (result.affectedRows === 0) {
      res.status(404).json({ 
        success: false, 
        message: '未找到要删除的记录' 
      });
      return;
    }

    res.json({ 
      success: true, 
      message: '删除成功' 
    });
  } catch (error) {
    console.error('删除数据错误:', error);
    res.status(500).json({ 
      success: false, 
      message: '服务器错误：' + error.message 
    });
  }
});

// 获取所有艺人列表
app.get('/api/artists', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT DISTINCT artist FROM performances ORDER BY artist'
    );
    res.json({ 
      success: true, 
      data: rows.map(row => row.artist)
    });
  } catch (error) {
    console.error('获取艺人列表错误:', error);
    res.status(500).json({ 
      success: false, 
      message: '服务器错误：' + error.message 
    });
  }
});

// 更新演出信息
app.put('/api/performances/:id', upload.single('poster'), async (req, res) => {
  try {
    const data = {
      artist: req.body.artist || null,
      type: req.body.type || null,
      province: req.body.province || null,
      city: req.body.city || null,
      venue: req.body.venue || null,
      notes: req.body.notes || null,
      date: req.body.date || null,
    };

    // 如果有新上传的海报，更新海报路径
    if (req.file) {
      data.poster = `/api/uploads/${req.file.filename}`;
    }

    // 验证必填字段
    if (!data.artist || !data.type || !data.province) {
      return res.status(400).json({
        success: false,
        message: '艺人、演出类型和省份是必填字段'
      });
    }

    // 构 SQL 更新语句
    const fields = Object.keys(data);
    const values = Object.values(data);
    const sql = `
      UPDATE performances 
      SET ${fields.map(field => `${field} = ?`).join(', ')}
      WHERE id = ?
    `;

    const [result] = await pool.execute(sql, [...values, req.params.id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: '未找到要更新的记录'
      });
    }

    res.json({
      success: true,
      message: '更新成功',
      data: result
    });
  } catch (error) {
    console.error('更新数据错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误：' + error.message
    });
  }
});

// 确保上传目录存在
const uploadDir = 'public/uploads';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

const port = process.env.PORT || 3000;
app.listen(port, async () => {
  try {
    await checkAndCreateTable();
    console.log(`Server running on port ${port}`);
  } catch (error) {
    console.error('服务器启动失败:', error);
  }
});

// 性能优化
app.set('json spaces', 2);
app.set('x-powered-by', false);

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: '服务器内部错误'
  });
});

// 添加一个用于检查表结构的路由
app.get('/api/check-schema', async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      DESCRIBE performances
    `);
    console.log('表结构:', rows);
    res.json({ 
      success: true, 
      schema: rows 
    });
  } catch (error) {
    console.error('获取表结构错误:', error);
    res.status(500).json({ 
      success: false, 
      message: '获取表结构失败：' + error.message 
    });
  }
});

// 在启动服务器之前添加
async function checkAndCreateTable() {
  try {
    const connection = await pool.getConnection();
    
    // 检查表是否存在
    const [tables] = await connection.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'performances'
    `, [dbConfig.database]);

    if (tables.length === 0) {
      // 创建表
      await connection.query(`
        CREATE TABLE IF NOT EXISTS performances (
          id INT AUTO_INCREMENT PRIMARY KEY,
          artist VARCHAR(255) NOT NULL,
          type VARCHAR(50) NOT NULL,
          province VARCHAR(50) NOT NULL,
          city VARCHAR(50),
          venue VARCHAR(255),
          notes TEXT,
          date DATE,
          poster VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('performances 表创建成功');
    } else {
      console.log('performances 表已存在');
      
      // 检查表结构
      const [columns] = await connection.query('DESCRIBE performances');
      console.log('当前表结构:', columns);
    }
    
    connection.release();
  } catch (error) {
    console.error('检查/创建表失败:', error);
    throw error;
  }
}

// 添加在其他路由之前
app.get('/api/test-db', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    // 添加响应头，防止缓存
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Expires': '-1',
      'Pragma': 'no-cache'
    });
    
    // 执行简单的查询测试
    const [testResult] = await connection.query('SELECT 1 as test');
    
    console.log('数据库连接测试成功', testResult);
    connection.release();
    
    res.json({ 
      success: true, 
      message: '数据库连接成功',
      test: testResult,
      timestamp: new Date().toISOString(),
      config: {
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database,
        user: dbConfig.user
      }
    });
  } catch (error) {
    console.error('数据库连接测试失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '数据库连接失败',
      error: error.message,
      timestamp: new Date().toISOString(),
      config: {
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database,
        user: dbConfig.user
      }
    });
  }
});