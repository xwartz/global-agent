"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _serializeError = _interopRequireDefault(require("serialize-error"));

var _Logger = _interopRequireDefault(require("../Logger"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const log = _Logger.default.child({
  namespace: 'Agent'
});

let requestId = 0;

class Agent {
  constructor(isProxyConfigured, mustUrlUseProxy, getUrlProxy, fallbackAgent, socketConnectionTimeout) {
    this.fallbackAgent = fallbackAgent;
    this.isProxyConfigured = isProxyConfigured;
    this.mustUrlUseProxy = mustUrlUseProxy;
    this.getUrlProxy = getUrlProxy;
    this.socketConnectionTimeout = socketConnectionTimeout;
  }

  addRequest(request, configuration) {
    let requestUrl; // It is possible that addRequest was constructed for a proxied request already, e.g.
    // "request" package does this when it detects that a proxy should be used
    // https://github.com/request/request/blob/212570b6971a732b8dd9f3c73354bcdda158a737/request.js#L402
    // https://gist.github.com/gajus/e2074cd3b747864ffeaabbd530d30218

    if (request.path.startsWith('http://') || request.path.startsWith('https://')) {
      requestUrl = request.path;
    } else {
      requestUrl = this.protocol + '//' + (configuration.hostname || configuration.host) + (configuration.port === 80 || configuration.port === 443 ? '' : ':' + configuration.port) + request.path;
    }

    if (!this.isProxyConfigured()) {
      log.trace({
        destination: requestUrl
      }, 'not proxying request; GLOBAL_AGENT.HTTP_PROXY is not configured'); // $FlowFixMe It appears that Flow is missing the method description.

      this.fallbackAgent.addRequest(request, configuration);
      return;
    }

    if (!this.mustUrlUseProxy(requestUrl)) {
      log.trace({
        destination: requestUrl
      }, 'not proxying request; url matches GLOBAL_AGENT.NO_PROXY'); // $FlowFixMe It appears that Flow is missing the method description.

      this.fallbackAgent.addRequest(request, configuration);
      return;
    }

    const currentRequestId = requestId++;
    const proxy = this.getUrlProxy(requestUrl);

    if (this.protocol === 'http:') {
      request.path = requestUrl;

      if (proxy.authorization) {
        request.setHeader('Proxy-Authorization', 'Basic ' + Buffer.from(proxy.authorization).toString('base64'));
      }
    }

    log.trace({
      destination: requestUrl,
      proxy: 'http://' + proxy.hostname + ':' + proxy.port,
      requestId: currentRequestId
    }, 'proxying request');
    request.on('error', error => {
      log.error({
        error: (0, _serializeError.default)(error)
      }, 'request error');
    });
    request.once('response', response => {
      log.trace({
        headers: response.headers,
        requestId: currentRequestId,
        statusCode: response.statusCode
      }, 'proxying response');
    });
    request.shouldKeepAlive = false;
    const connectionConfiguration = {
      host: configuration.hostname || configuration.host,
      port: configuration.port || 80,
      proxy
    }; // $FlowFixMe It appears that Flow is missing the method description.

    this.createConnection(connectionConfiguration, (error, socket) => {
      // @see https://github.com/nodejs/node/issues/5757#issuecomment-305969057
      if (socket) {
        socket.setTimeout(this.socketConnectionTimeout, () => {
          socket.destroy();
        });
        socket.once('connect', () => {
          socket.setTimeout(0);
        });
      }

      if (error) {
        request.emit('error', error);
      } else {
        log.debug('created socket');
        socket.on('error', socketError => {
          log.error({
            error: (0, _serializeError.default)(socketError)
          }, 'socket error');
        });
        request.onSocket(socket);
      }
    });
  }

}

var _default = Agent;
exports.default = _default;
//# sourceMappingURL=Agent.js.map