const express = require('express');
const WebSocket = require('ws');
const router = express.Router();
const {
  activeCalls,
} = require('../services/xApi.js');
const lodash = require('lodash');
const { autoOutbound } = require('../components/autoOutbound.js');
const throttledAutoOutbound = lodash.throttle(autoOutbound, 30, { trailing: false });

const { logWithTimestamp, errorWithTimestamp } = require('../util/timestamp.js');
const { projectsMatchingCallFn } = require('../components/projectsMatchingCallFn.js');
const { mainActionType } = require('../util/mainActionType.js');
const { hangupCall } = require('../services/callControl.js');


require('dotenv').config();

const CALL_GAP_TIME = Number(process.env.CALL_GAP_TIME) || 1; // 預設 1 秒

// 創建 WebSocket Server
const clientWsProjectOutbound = new WebSocket.Server({ noServer: true });

clientWsProjectOutbound.on('connection', (ws) => {
  logWithTimestamp('WebSocket Server - clientWsProjectOutbound: Client connected');

  ws.on('close', () => {
    logWithTimestamp('WebSocket Server - clientWsProjectOutbound: Client disconnected');
  });
});

let isApiRunning = false; // 用來判斷 API 是否正在運行

let globalToken = null;
const projects = []; // 儲存專案資訊
const activeCallQueue = []; // 儲存活躍撥號的佇列

function projectsIntervalAutoOutbound() {
  // 如果沒有專案，就不進行撥號
  if (projects.length === 0) {
    logWithTimestamp('沒有專案，跳過自動撥號');
    return;
  }

  projects.forEach(async (project, projectIndex, projectArray ) => {
    // 隨機延遲 0-50 毫秒再執行 throttledAutoOutbound
    const randomDelay = Math.floor(Math.random() * 101); // 0~50 ms
    await new Promise(resolve => setTimeout(resolve, randomDelay));
    const called = await throttledAutoOutbound(project, projectIndex, projectArray);
    if (called) {
      globalToken = called.addInActiveCallQueue.token; // 更新 globalToken
      projectArray[projectIndex].currentMakeCall = called.currentMakeCall // 更新專案的 currentMakeCall 狀態
      activeCallQueue.push(called.addInActiveCallQueue);
    }
  });
}

// 每 CALL_GAP_TIME 秒 進行自動撥號 並 檢查撥號狀態
setInterval(async () => {
  // 如果正在運行 API，就跳過本次自動撥號
  // 這是為了避免在 API 改變 project 狀態時，導致自動撥號的狀態不一致
  if (isApiRunning) {
    logWithTimestamp('API 正在運行，跳過本次自動撥號');
    return; // 如果 API 正在運行，就跳過本次自動撥號
  }

  // 每 CALL_GAP_TIME 秒 專案進行自動撥號
  projectsIntervalAutoOutbound()

  // logWithTimestamp(`每 ${CALL_GAP_TIME} 秒檢查一次撥號狀態`);
  if (!globalToken) { // 如果沒有 token 就回傳給所有客戶端一個空陣列
    logWithTimestamp('沒有 globalToken，回傳 projects');
    clientWsProjectOutbound.clients.forEach((client) => {
      const toClientProjects = projects.map(project => ({
        projectId: project.projectId,
        action: project.action,
        callFlowId: project.callFlowId,
        projectCallData: project.projectCallData,
      }));
      const newSetProjects = lodash.uniqBy(toClientProjects, 'projectId'); // 去除重複的專案
      client.send(JSON.stringify(newSetProjects));
    });
    return;
  };

  try {
    // 獲取目前活躍的撥號狀態
    const fetch_getActiveCalls = await activeCalls(globalToken);
    logWithTimestamp('獲取目前活躍的撥號狀態:', fetch_getActiveCalls);

    // 如果 token 失效，清除 globalToken
    // 這邊的狀況是 token 失效了，這時候我們要清除 globalToken 讓流程持續
    if (!fetch_getActiveCalls.success && fetch_getActiveCalls.error.status === 401) {
      logWithTimestamp('token 失效，清除 globalToken 讓流程持續');
      globalToken = null;
      clientWsProjectOutbound.clients.forEach((client) => {
        logWithTimestamp('自動外撥專案實況',projects);
        client.send(JSON.stringify(projects));
      });
      return
    }

    const activeCall = fetch_getActiveCalls.data; // 目前活躍的撥號狀態

    let matchingCallResults = []; // 儲存匹配的撥號物件

    // 遍歷 activeCallQueue，檢查是否有匹配的 callId
    for (let i = activeCallQueue.length - 1; i >= 0; i--) {
      const queueItem = activeCallQueue[i];
      const matchingCall = activeCall.value?.find(item => item.Id === queueItem.callid);

      if (matchingCall) {
        matchingCallResults.push({
          id:queueItem.id,
          phone: queueItem.phone,
          callFlowId: queueItem.callFlowId,
          projectId: queueItem.projectId,
          customerId: queueItem.customerId,
          activeCall: matchingCall
        });
        
      } else {
        // logWithTimestamp(`移除無匹配的 callId: ${queueItem.callid}`);
        activeCallQueue.splice(i, 1); // 移除無匹配的項目
      }
    }
    // logWithTimestamp('匹配的撥號物件:', matchingCallResults);
    await projectsMatchingCallFn(projects, matchingCallResults);

    // 將匹配的撥號物件傳送給 WebSocket Server 的所有連線客戶端
    clientWsProjectOutbound.clients.forEach((client) => {
      // logWithTimestamp('自動外撥專案實況',projects);
      const toClientProjects = projects.map(project => ({
        projectId: project.projectId,
        action: project.action,
        callFlowId: project.callFlowId,
        projectCallData: project.projectCallData,
      }));
      const newSetProjects = lodash.uniqBy(toClientProjects, 'projectId'); // 去除重複的專案
      client.send(JSON.stringify(newSetProjects));
    });

  } catch (error) {
    errorWithTimestamp('Error while checking active calls:', error.message);
  }
}, CALL_GAP_TIME * 1000); // 每 CALL_GAP_TIME 秒檢查一次撥號狀態

// projectOutbound API - 將專案加入自動撥號佇列
router.post('/', async function(req, res, next) {
  isApiRunning = true; // API 開始，設為 true
  try {
    const { grant_type, client_id, client_secret, callFlowId, projectId, action } = req.body;
    // action 有 5 種狀態 active, stop, pause, waiting, recording
    if (!grant_type || !client_id || !client_secret || !callFlowId || !projectId || !action) {
      errorWithTimestamp('Missing required fields');
      res.status(400).send('Missing required fields');
    }
    // 檢查專案是否已存在
    const existingProject = projects.find(project => project.projectId === projectId);
    if (existingProject) {
      errorWithTimestamp(`Project with ID ${projectId} already exists`);
      return res.status(400).send(`Project with ID ${projectId} already exists`);
    }
    // 如果專案不存在，則新增該專案
    if (action !== 'active' && action !== 'stop' && action !== 'pause' && action !== 'waiting' && action !== 'recording') {
      errorWithTimestamp(`Invalid action: ${action}. Action must be one of 'active', 'stop', 'pause', 'waiting', or 'recording'`);
      return res.status(400).send(`Invalid action: ${action}. Action must be one of 'active', 'stop', 'pause', 'waiting', or 'recording'`);
    }
    // 新增專案到佇列
    projects.push({ grant_type, client_id, client_secret, callFlowId, projectId, action, projectCallData: null, });

    res.status(200).send({
      message: 'Request projectOutbound successfully'
    });
  } finally {
    isApiRunning = false; // API 結束，設為 false
  }
  
});

// projectOutbound API - 改變專案資料
router.put('/:projectId', async function(req, res, next) {
  isApiRunning = true; // API 開始，設為 true
  try {
    const { projectId: paramsProjectId } = req.params;
    const { grant_type, client_id, client_secret, callFlowId, projectId } = req.body;
    if (!paramsProjectId || !grant_type || !client_id || !client_secret || !projectId || !callFlowId) {
      errorWithTimestamp('Missing required fields');
      return res.status(400).send('Missing required fields');
    }

    // 檢查專案是否已存在
    const existingProject = projects.find(project => project.projectId === paramsProjectId);
    if (!existingProject) {
      errorWithTimestamp(`Project with ID ${projectId} is not exists`);
      return res.status(400).send(`Project with ID ${projectId} is not exists`);
    }

    // 如果已存在，則更新該專案的資料，但保留原本的 projectCallData
    const updatedProject = {
      grant_type,
      client_id,
      client_secret,
      callFlowId,
      projectId,
      action: existingProject.action, // 保留原本的 action 狀態
      projectCallData: existingProject.projectCallData // 保留原本的 projectCallData
    };
    const index = projects.findIndex(project => project.projectId === paramsProjectId);
    if (index !== -1) {
      projects[index] = updatedProject;
    }
    res.status(200).send({
      message: `Project ${projectId} updated successfully`,
      project: updatedProject
    });
  } finally {
    isApiRunning = false; // API 結束，設為 false
  }
  
});

// projectOutbound API - 改變專案狀態
router.patch('/:projectId', async function(req, res, next) {
  isApiRunning = true; // API 開始，設為 true
  try {
    const { projectId } = req.params;
    const { action } = req.body; 
    // action 有 以下種狀態
    // active: 激活撥號
    // start: 開始撥號
    // stop: 停止撥號
    // pause: 暫停撥號
    // calling: 正在撥號
    // waiting: 等待撥號
    // recording: 開始紀錄
    if (!projectId || !action) {
      errorWithTimestamp('Missing required fields');
      res.status(400).send('Missing required fields');
    }

    // 限制只能改變特定 action 狀態
    if (!['active', 'start', 'pause'].includes(action)) {
      errorWithTimestamp(`Invalid action: ${action}. Action must be one of 'active', 'start', 'pause'`);
      return res.status(400).send(`Invalid action: ${action}. Action must be one of 'active', 'start', 'pause'`);
    }

    // 如果狀態是 'pause'，則要掛斷電話
    if (action === 'pause') {
      const project = projects.find(project => project.projectId === projectId);
      if (!project) {
        errorWithTimestamp(`Project with ID ${projectId} not found`);
        return res.status(404).send(`Project with ID ${projectId} not found`);
      }

      // 如果專案有正在撥打的電話，則掛斷電話
      if (project.currentMakeCall && project.currentMakeCall.token) {
        try {
          const { token, dn, id } = project.currentMakeCall;
          await hangupCall(token, dn, id);
          logWithTimestamp(`Project ${projectId} call with callid ${project.currentMakeCall.callid} has been hung up`);
          // 清除專案的 currentMakeCall 狀態
          project.currentMakeCall = null;
        } catch (error) {
          errorWithTimestamp(`Failed to hang up call for project ${projectId}: ${error.message}`);
          return res.status(500).send(`Failed to hang up call for project ${projectId}: ${error.message}`);
        }
      }
    }

    // projectOutbound API - 找到對應的專案並更新 action 狀態
    const projectIndex = projects.findIndex(project => project.projectId === projectId);
    if (projectIndex === -1) {
      errorWithTimestamp(`Project with ID ${projectId} not found`);
      res.status(404).send(`Project with ID ${projectId} not found`);
    }

    projects[projectIndex].action = action;

    res.status(200).send({
      message: `Project ${projectId} updated successfully`,
      project: projects[projectIndex]
    });
  } finally {
    isApiRunning = false; // API 結束，設為 false
  }
});

// projectOutbound API - 刪除專案
router.delete('/:projectId', async function(req, res, next) {
  isApiRunning = true; // API 開始，設為 true
  try {
    const { projectId } = req.params;
    // action 有 以下種狀態
    // active: 激活撥號
    // start: 開始撥號
    // stop: 停止撥號
    // pause: 暫停撥號
    // calling: 正在撥號
    // waiting: 等待撥號
    // recording: 開始紀錄
    if (!projectId) {
      errorWithTimestamp('Missing required fields');
      res.status(400).send('Missing required fields');
    }

    // 檢查專案是否已存在
    const existingProject = projects.find(project => project.projectId === projectId);
    if (!existingProject) {
      errorWithTimestamp(`Project with ID ${projectId} is not exists`);
      return res.status(400).send(`Project with ID ${projectId} is not exists`);
    }

    // 限制只有專案狀態為 pause 才能刪除
    if (mainActionType(existingProject.action) !== 'pause') {
      errorWithTimestamp(`Project with ID ${projectId} is not in 'pause' state, cannot be deleted`);
      return res.status(400).send(`Project with ID ${projectId} is not in 'pause' state, cannot be deleted`);
    }
    
    // 從專案列表中刪除該專案
    const projectIndex = projects.findIndex(project => project.projectId === projectId);
    if (projectIndex === -1) {
      errorWithTimestamp(`Project with ID ${projectId} not found`);
      return res.status(404).send(`Project with ID ${projectId} not found`);
    }
    projects.splice(projectIndex, 1);

    // 如果刪除後沒有專案，或所有專案都沒有 currentMakeCall/token，則清空 globalToken
    if (projects.length === 0 || !projects.some(p => p.currentMakeCall && p.currentMakeCall.token)) {
      globalToken = null;
    }

    res.status(200).send({
      message: `Project ${projectId} delete successfully`,
    });
  } finally {
    isApiRunning = false; // API 結束，設為 false
  }
});

module.exports = { router, clientWsProjectOutbound };
