const { serviceTypes } = require('../../utils/mock-data');
const { createPost, saveSubscribeAuth } = require('../../utils/cloud-api');
const { requestSubscribe } = require('../../utils/subscribe');
const { uploadPostImages } = require('../../utils/upload');
const { detectRiskKeywords } = require('../../utils/risk');
const { savePendingPost } = require('../../utils/draft');

Page({
  data: {
    serviceTypes,
    selectedType: 'help',
    form: {
      title: '',
      location: '',
      description: ''
    },
    images: [],
    uploading: false,
    trainBinding: null,
    riskWarning: ''
  },

  onLoad(options = {}) {
    if (options.type) {
      this.setData({
        selectedType: options.type
      });
    }
    this.loadTrainBinding();
  },

  onShow() {
    this.loadTrainBinding();
  },

  loadTrainBinding() {
    const app = getApp();
    const binding = app && app.globalData.trainBinding;
    this.setData({ trainBinding: binding });
  },

  goTrainBinding() {
    wx.navigateTo({
      url: '/pages/train-binding/train-binding'
    });
  },

  selectType(event) {
    this.setData({
      selectedType: event.currentTarget.dataset.type
    });
  },

  updateField(event) {
    const { field } = event.currentTarget.dataset;
    const value = event.detail.value;
    this.setData({
      [`form.${field}`]: value
    });

    // 实时风控检测
    if (field === 'title' || field === 'description') {
      const riskResult = detectRiskKeywords(value);
      this.setData({
        riskWarning: riskResult.hasRisk ? `检测到敏感词：${riskResult.keywords.join('、')}` : ''
      });
    }
  },

  chooseImages() {
    wx.chooseMedia({
      count: 6 - this.data.images.length,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const nextImages = res.tempFiles.map((file) => file.tempFilePath);
        this.setData({
          images: this.data.images.concat(nextImages).slice(0, 6)
        });
      }
    });
  },

  previewImage(event) {
    wx.previewImage({
      current: event.currentTarget.dataset.url,
      urls: this.data.images
    });
  },

  removeImage(event) {
    const index = event.currentTarget.dataset.index;
    this.setData({
      images: this.data.images.filter((_, itemIndex) => itemIndex !== index)
    });
  },

  async submitPost() {
    if (this.data.uploading) return;

    const { form, selectedType, trainBinding } = this.data;

    // 检查车次绑定
    if (!trainBinding || !trainBinding.trainNo) {
      wx.showModal({
        title: '请先绑定车次',
        content: '发布互助信息需要先绑定你的车次和车厢号，这样才能让同车旅客看到。',
        confirmText: '去绑定',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/train-binding/train-binding' });
          }
        }
      });
      return;
    }

    if (!form.title || !form.description) {
      wx.showToast({
        title: '请填写标题和说明',
        icon: 'none'
      });
      return;
    }

    // 风控检测
    const titleRisk = detectRiskKeywords(form.title);
    const descRisk = detectRiskKeywords(form.description);
    if (titleRisk.hasRisk || descRisk.hasRisk) {
      wx.showModal({
        title: '内容包含敏感词',
        content: '您的发布内容包含敏感词汇，请修改后重新提交。',
        showCancel: false
      });
      return;
    }

    const postData = {
      ...form,
      type: selectedType,
      trainNo: trainBinding.trainNo,
      carriageNo: trainBinding.carriageNo,
      seatNo: trainBinding.seatNo || '',
      location: `${trainBinding.trainNo} · ${trainBinding.carriageNo}车厢${trainBinding.seatNo ? ' · ' + trainBinding.seatNo : ''}`,
      images: []
    };

    this.setData({ uploading: true });
    try {
      // 上传图片（仅帮助类帖可上传，求助帖不建议图片）
      if (this.data.images.length > 0) {
        postData.images = await uploadPostImages(this.data.images);
      }

      const result = await createPost(postData);
      wx.showToast({
        title: result && result.ok ? '发布成功' : '已保存，同车旅客可见',
        icon: 'none'
      });

      // 求助者可开启订阅消息
      if (selectedType === 'help') {
        this.requestPublishNoticeAuth();
      }

      setTimeout(() => {
        wx.navigateBack();
      }, 1000);
    } catch (error) {
      // 隧道/弱网时发布请求会直接抛错，先把内容暂存本地，联网后由 app.onShow 自动补发
      console.error('发布失败：', error);
      savePendingPost(postData);
      wx.showModal({
        title: '网络不稳定',
        content: '内容已暂存到本地，联网后会自动重试发布，不用重新填写。',
        showCancel: false,
        success: () => {
          wx.navigateBack();
        }
      });
    } finally {
      this.setData({ uploading: false });
    }
  },

  async requestPublishNoticeAuth() {
    const channels = ['chat', 'order'];
    const result = await requestSubscribe(channels);
    if (result.ok) {
      await saveSubscribeAuth({
        channels,
        auth: result.auth,
        scene: 'publish_success'
      });
    }
  }
});
