// src/App.js
import React from 'react';
import Layout from './components/Layout';
import PerformanceMap from './components/PerformanceMap.jsx';
import API_BASE_URL from './config/api';
import axios from 'axios';

// 配置 axios 默认值
axios.defaults.baseURL = API_BASE_URL;
axios.defaults.withCredentials = true;

function App() {
  return (
    <Layout>
      <PerformanceMap />
    </Layout>
  );
}

export default App;