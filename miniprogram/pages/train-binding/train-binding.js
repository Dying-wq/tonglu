const { bindTrain, unbindTrain } = require('../../utils/cloud-api');
const {
  buildTrainBinding,
  parseArrivalInput,
  estimateDurationMs,
  formatDateTime,
  formatDate,
  formatTime,
  formatRemaining,
  calcRemainingRatio
} = require('../../utils/train');

Page({
  data: {
    trainNo: '',
    carriageNo: '',
    seatNo: '',
    currentBinding: null,
    submitting: false,
    // 到达时间（选填）：填了按真实车程算，不填按车次类型估
    arrivalDate: '',
    arrivalTime: '',
    dateStart: '',
    arrivalHint: '',
    bindingRemaining: '',
    arrivalText: ''
  },

  onLoad() {
    this.initArrivalPicker();
    this.loadCurrentBinding();
  },

  onShow() {
    this.loadCurrentBinding();
  },

  // 日期 picker 的起始值：今天
  initArrivalPicker() {
    const today = formatDate(Date.now());
    this.setData({ dateStart: today });
  },

  // 根据车次号实时提示「不填到达时间会按多久估算」
  refreshArrivalHint(trainNo) {
    const hours = Math.round((estimateDurationMs(trainNo) / 3600000) * 10) / 10;
    this.setData({
      arrivalHint: trainNo
        ? `不填到达时间时，按车次类型估算为 ${hours} 小时左右`
        : '选填。不填则按车次类型自动估算行程时长'
    });
  },

  loadCurrentBinding() {
    const app = getApp();
    const binding = app && app.globalData.trainBinding;
    if (binding) {
      this.setData({
        currentBinding: binding,
        trainNo: binding.trainNo || '',
        carriageNo: binding.carriageNo || '',
        seatNo: binding.seatNo || '',
        arrivalDate: formatDate(binding.arrivalTs) || '',
        arrivalTime: formatTime(binding.arrivalTs) || '',
        bindingRemaining: formatRemaining(binding),
        arrivalText: formatDateTime(binding.arrivalTs)
      });
      this.refreshArrivalHint(binding.trainNo);
    } else {
      this.setData({ currentBinding: null, bindingRemaining: '', arrivalText: '' });
      this.refreshArrivalHint(this.data.trainNo);
    }
  },

  updateField(event) {
    const { field } = event.currentTarget.dataset;
    let value = event.detail.value;
    // 车次号大写
    if (field === 'trainNo') {
      value = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      this.refreshArrivalHint(value);
    }
    // 车厢号纯数字
    if (field === 'carriageNo') {
      value = value.replace(/[^0-9]/g, '');
    }
    this.setData({ [field]: value });
  },

  // 到达时间选择（日期 + 时间）
  onArrivalDateChange(event) {
    this.setData({ arrivalDate: event.detail.value });
  },

  onArrivalTimeChange(event) {
    this.setData({ arrivalTime: event.detail.value });
  },

  clearArrival() {
    this.setData({ arrivalDate: '', arrivalTime: '' });
  },

  async submitBinding() {
    if (this.data.submitting) return;

    const { trainNo, carriageNo, seatNo, arrivalDate, arrivalTime } = this.data;
    if (!trainNo) {
      wx.showToast({ title: '请输入车次号', icon: 'none' });
      return;
    }
    if (!carriageNo) {
      wx.showToast({ title: '请输入车厢号', icon: 'none' });
      return;
    }

    // 只填了日期或只填了时间，视为无效输入
    const arrivalTs = (arrivalDate && arrivalTime)
      ? parseArrivalInput(arrivalDate, arrivalTime)
      : 0;
    if ((arrivalDate && !arrivalTime) || (!arrivalDate && arrivalTime)) {
      wx.showToast({ title: '到达时间需同时选择日期和时间', icon: 'none' });
      return;
    }
    if (arrivalTs && arrivalTs <= Date.now()) {
      wx.showToast({ title: '到达时间需晚于当前时间', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });

    // 按真实到达时间生成绑定；没填到达时间时按车次类型估算时长
    const binding = buildTrainBinding({
      trainNo,
      carriageNo,
      seatNo,
      arrivalTs,
      departTs: Date.now()
    });

    try {
      const result = await bindTrain(binding);
      if (result && result.ok) {
        // 使用云函数返回的绑定信息
        if (result.binding) {
          getApp().setTrainBinding(result.binding);
        }
      } else {
        // 离线模式：本地保存
        getApp().setTrainBinding(binding);
      }

      wx.showToast({ title: '车次绑定成功', icon: 'success' });

      setTimeout(() => {
        wx.navigateBack();
      }, 800);
    } catch (error) {
      // 弱网/断网时云函数调用会抛错，退回本地绑定，保证同车过滤仍可用
      console.error('车次绑定失败，已本地保存：', error);
      getApp().setTrainBinding(binding);
      wx.showToast({ title: '网络不稳，已本地保存绑定', icon: 'none' });
      setTimeout(() => {
        wx.navigateBack();
      }, 1000);
    } finally {
      this.setData({ submitting: false });
    }
  },

  async unbind() {
    const res = await wx.showModal({
      title: '解除绑定',
      content: '确定要解除当前车次绑定吗？解除后将无法看到同车次信息。',
      confirmText: '解除',
      confirmColor: '#EB5757'
    });

    if (res.confirm) {
      try {
        await unbindTrain();
      } catch (error) {
        // 云端解绑失败也要清掉本地绑定，避免界面和实际状态不一致
        console.error('云端解绑失败，已清理本地绑定：', error);
      }
      getApp().setTrainBinding(null);
      this.setData({
        currentBinding: null,
        trainNo: '',
        carriageNo: '',
        seatNo: '',
        arrivalDate: '',
        arrivalTime: '',
        bindingRemaining: '',
        arrivalText: ''
      });
      wx.showToast({ title: '已解除绑定', icon: 'success' });
      setTimeout(() => {
        wx.navigateBack();
      }, 800);
    }
  }
});
