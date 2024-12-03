// API基础URL配置
const API_BASE_URL = process.env.NODE_ENV === 'development' 
  ? 'http://localhost:3001/api'  // 开发环境
  : '/api';  // 生产环境

export default API_BASE_URL; 