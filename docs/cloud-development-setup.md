# 微信云开发接入说明

## 1. 填写云环境 ID

在微信开发者工具中开通云开发，创建环境后，把环境 ID 填入：

```text
miniprogram/config.js
```

```js
const CLOUD_ENV_ID = '你的云环境ID';
```

如果留空，小程序会使用开发者工具当前默认云环境。

## 2. 创建云数据库集合

在云开发控制台创建以下集合：

```text
users
posts
orders
conversations
messages
wechat_exchange_requests
reviews
notifications
notification_settings
subscribe_records
notification_logs
blocks
reports
complaints
admin_logs
promotions
```

## 3. 上传云函数

在微信开发者工具中右键 `cloudfunctions` 下的每个函数，选择：

```text
上传并部署：云端安装依赖
```

需要上传：

```text
login
createPost
acceptOrder
publisherAcceptOrder
sendMessage
ensureConversation
createOrGetConversation
getConversationList
getMessageList
markConversationRead
getUnreadCount
confirmComplete
submitReview
requestWechatExchange
respondWechatExchange
createComplaint
reviewComplaint
reportConversationOrMessage
blockUser
adminUpdateStatus
getAdminDashboard
monthlyRankDecay
joinHotPromotion
updateProfile
saveSubscribeAuth
sendSubscribeNotice
expirePromotions
```

## 4. 当前已接入的流程

- `login`：获取 openid，首次登录自动创建 `users` 记录。
- `createPost`：发布内容写入 `posts`。
- `acceptOrder`：接单/下单/报名后创建待发布者接受的 `orders` 和 `conversations`，帖子继续公开展示。
- `publisherAcceptOrder`：发布者私聊协商后接受某个接单申请，订单进入进行中，帖子从公开列表隐藏。
- `sendMessage`：写入 `messages`，更新会话最后一条消息。
- `createOrGetConversation` / `ensureConversation`：联系发布人时创建或复用与帖子绑定的会话。
- `getConversationList`：读取消息中心会话列表。
- `getMessageList`：读取某个会话的聊天记录。
- `markConversationRead`：进入聊天页后清空当前用户在该会话的未读数。
- `getUnreadCount`：统计底部 Tab 消息红点数量。
- `confirmComplete`：仅发布者可确认完成，订单进入待评价。
- `submitReview`：写入评价，更新被评价方信誉分、段位和本月完成数。
- `requestWechatExchange` / `respondWechatExchange`：双方同意后推进微信交换状态。
- `createComplaint`：写入投诉。
- `reviewComplaint`：管理员仲裁投诉，成立后扣除被投诉方信誉分并标记关联内容/订单为纠纷中。
- `reportConversationOrMessage`：举报会话或消息，写入 `reports`。
- `blockUser`：拉黑用户，写入 `blocks`。
- `adminUpdateStatus`：管理员更新内容、订单、评价或投诉状态。
- `monthlyRankDecay`：检查用户月度活跃，未完成订单自动掉一段。
- `joinHotPromotion`：用户消耗 1 次热门次数，将自己展示中的合规帖子置顶 3 小时。
- `updateProfile`：保存用户自定义头像、姓名、学校、院系和个人简介。
- `saveSubscribeAuth`：保存用户订阅消息授权记录和提醒设置。
- `sendSubscribeNotice`：关键事件触发微信订阅消息服务通知。
- `expirePromotions`：清理过期热门，并恢复帖子普通排序。

订阅消息模板 ID 配置在：

```text
miniprogram/config.js
```

只填写模板 ID，不要提交 appSecret。

## 5. 页面接入方式

前端统一通过：

```text
miniprogram/utils/cloud-api.js
```

调用云函数或读取云数据库。云环境未初始化时会自动回退到本地演示数据，方便先看界面。
