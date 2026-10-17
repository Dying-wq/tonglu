const { bindTrain, unbindTrain } = require('../../utils/cloud-api');

Page({
  data: {
    trainNo: '',
    carriageNo: '',
    seatNo: '',
    currentBinding: null,
    submitting: false
  },

  onLoad() {
    this.loadCurrentBinding();
  },

  onShow() {
    this.loadCurrentBinding();
  },

  loadCurrentBinding() {
    const app = getApp();
    const binding = app && app.globalData.trainBinding;
    if (binding) {
      this.setData({
        currentBinding: binding,
        trainNo: binding.trainNo || '',
        carriageNo: binding.carriageNo || '',
        seatNo: binding.seatNo || ''
      });
    } else {
      this.setData({ currentBinding: null });
    }
  },

  updateField(event) {
    const { field } = event.currentTarget.dataset;
    let value = event.detail.value;
    // 车次号大写
    if (field === 'trainNo') {
      value = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
    // 车厢号纯数字
    if (field === 'carriageNo') {
      value = value.replace(/[^0-9]/g, '');
    }
    this.setData({ [field]: value });
  },

  async submitBinding() {
    if (this.data.submitting) return;

    const { trainNo, carriageNo, seatNo } = this.data;
    if (!trainNo) {
      wx.showToast({ title: '请输入车次号', icon: 'none' });
      return;
    }
    if (!carriageNo) {
      wx.showToast({ title: '请输入车厢号', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });

    // 模拟：预计3小时后到站
    const arrivalTs = Date.now() + 3 * 60 * 60 * 1000;
    const binding = {
      trainNo,
      carriageNo,
      seatNo,
      boundAt: Date.now(),
      arrivalTs,
      remainingRatio: 1.0
    };

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
      await unbindTrain();
      this.setData({
        currentBinding: null,
        trainNo: '',
        carriageNo: '',
        seatNo: ''
      });
      wx.showToast({ title: '已解除绑定', icon: 'success' });
      setTimeout(() => {
        wx.navigateBack();
      }, 800);
    }
  }
});
