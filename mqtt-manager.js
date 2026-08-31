/**
 * MQTT 管理器 - 处理 MQTT 连接、发布和订阅
 */
class MQTTManager {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.config = this.loadConfig();
        this.subscriptions = new Set(this.loadSubscriptions());
        this.messageHandlers = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    /**
     * 从 localStorage 加载配置
     */
    loadConfig() {
        const saved = localStorage.getItem('mqttConfig');
        if (saved) {
            return JSON.parse(saved);
        }
        return {
            host: 'broker.emqx.io',
            port: 8083,
            path: '/mqtt',
            clientId: 'component_manager_' + Math.random().toString(16).substr(2, 8),
            username: '',
            password: '',
            ssl: false,
            keepalive: 60,
            connectTimeout: 4000
        };
    }

    /**
     * 保存配置到 localStorage
     */
    saveConfig(config) {
        this.config = { ...this.config, ...config };
        localStorage.setItem('mqttConfig', JSON.stringify(this.config));
    }

    /**
     * 从 localStorage 加载订阅主题
     */
    loadSubscriptions() {
        const saved = localStorage.getItem('mqttSubscriptions');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                return [];
            }
        }
        return [];
    }

    /**
     * 保存订阅主题到 localStorage
     */
    saveSubscriptions() {
        localStorage.setItem('mqttSubscriptions', JSON.stringify(Array.from(this.subscriptions)));
    }

    /**
     * 连接到 MQTT Broker
     */
    async connect(config = null) {
        if (config) {
            this.saveConfig(config);
        }

        return new Promise((resolve, reject) => {
            try {
                // 如果已连接，先断开
                if (this.client) {
                    this.disconnect();
                }

                // 构建连接 URL
                const protocol = this.config.ssl ? 'wss' : 'ws';
                const url = `${protocol}://${this.config.host}:${this.config.port}${this.config.path}`;

                console.log('MQTT 连接中...', url);

                this.client = mqtt.connect(url, {
                    clientId: this.config.clientId,
                    username: this.config.username,
                    password: this.config.password,
                    keepalive: this.config.keepalive,
                    connectTimeout: this.config.connectTimeout,
                    clean: true,
                    reconnectPeriod: 1000
                });

                this.client.on('connect', () => {
                    console.log('MQTT 已连接');
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    
                    // 重新订阅之前的主题
                    this.resubscribe();
                    
                    resolve({ success: true, message: '连接成功' });
                });

                this.client.on('error', (err) => {
                    console.error('MQTT 连接错误:', err);
                    this.isConnected = false;
                    reject({ success: false, message: '连接错误: ' + err.message });
                });

                this.client.on('close', () => {
                    console.log('MQTT 连接已关闭');
                    this.isConnected = false;
                });

                this.client.on('reconnect', () => {
                    console.log('MQTT 重新连接中...');
                    this.reconnectAttempts++;
                    if (this.reconnectAttempts > this.maxReconnectAttempts) {
                        console.error('MQTT 重连次数超过限制');
                        this.client.end();
                    }
                });

                this.client.on('message', (topic, message) => {
                    const payload = message.toString();
                    console.log('MQTT 收到消息:', topic, payload);
                    
                    // 调用注册的消息处理器
                    for (const [pattern, handler] of this.messageHandlers) {
                        if (this.matchTopic(pattern, topic)) {
                            handler(topic, payload);
                        }
                    }
                });

            } catch (err) {
                reject({ success: false, message: '连接失败: ' + err.message });
            }
        });
    }

    /**
     * 断开连接
     */
    disconnect() {
        if (this.client) {
            this.client.end();
            this.client = null;
            this.isConnected = false;
            // 不清空 subscriptions，保持已保存的订阅主题
            console.log('MQTT 已断开');
        }
    }

    /**
     * 订阅主题
     */
    subscribe(topic, options = { qos: 0 }) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected || !this.client) {
                reject({ success: false, message: 'MQTT 未连接' });
                return;
            }

            this.client.subscribe(topic, options, (err) => {
                if (err) {
                    reject({ success: false, message: '订阅失败: ' + err.message });
                } else {
                    this.subscriptions.add(topic);
                    this.saveSubscriptions(); // 保存到 localStorage
                    console.log('MQTT 已订阅:', topic);
                    resolve({ success: true, message: '订阅成功' });
                }
            });
        });
    }

    /**
     * 取消订阅
     */
    unsubscribe(topic) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected || !this.client) {
                reject({ success: false, message: 'MQTT 未连接' });
                return;
            }

            this.client.unsubscribe(topic, (err) => {
                if (err) {
                    reject({ success: false, message: '取消订阅失败: ' + err.message });
                } else {
                    this.subscriptions.delete(topic);
                    this.saveSubscriptions(); // 保存到 localStorage
                    console.log('MQTT 已取消订阅:', topic);
                    resolve({ success: true, message: '取消订阅成功' });
                }
            });
        });
    }

    /**
     * 重新订阅所有主题
     */
    resubscribe() {
        this.subscriptions.forEach(topic => {
            this.subscribe(topic).catch(err => {
                console.error('重新订阅失败:', topic, err);
            });
        });
    }

    /**
     * 发布消息
     */
    publish(topic, message, options = { qos: 0, retain: false }) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected || !this.client) {
                reject({ success: false, message: 'MQTT 未连接' });
                return;
            }

            const payload = typeof message === 'string' ? message : JSON.stringify(message);
            
            this.client.publish(topic, payload, options, (err) => {
                if (err) {
                    reject({ success: false, message: '发布失败: ' + err.message });
                } else {
                    console.log('MQTT 已发布:', topic, payload);
                    resolve({ success: true, message: '发布成功' });
                }
            });
        });
    }

    /**
     * 注册消息处理器
     * 支持通配符: + (单级), # (多级)
     */
    onMessage(topicPattern, handler) {
        this.messageHandlers.set(topicPattern, handler);
    }

    /**
     * 移除消息处理器
     */
    offMessage(topicPattern) {
        this.messageHandlers.delete(topicPattern);
    }

    /**
     * 主题匹配（支持通配符）
     */
    matchTopic(pattern, topic) {
        if (pattern === topic) return true;

        const patternSegments = pattern.split('/');
        const topicSegments = topic.split('/');

        // # 必须是最后一个
        const lastPattern = patternSegments[patternSegments.length - 1];
        if (lastPattern !== '#' && patternSegments.length !== topicSegments.length) {
            return false;
        }

        for (let i = 0; i < patternSegments.length; i++) {
            const p = patternSegments[i];
            const t = topicSegments[i];

            if (p === '#') {
                return true;
            }

            if (p !== '+' && p !== t) {
                return false;
            }
        }

        return true;
    }

    /**
     * 获取连接状态
     */
    getStatus() {
        return {
            isConnected: this.isConnected,
            subscriptions: Array.from(this.subscriptions)
        };
    }

    /**
     * 获取当前配置
     */
    getConfig() {
        return { ...this.config };
    }
}

// 创建全局单例
window.mqttManager = new MQTTManager();
