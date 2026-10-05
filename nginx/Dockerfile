FROM owasp/modsecurity-crs:nginx-alpine

USER root

RUN rm -f /docker-entrypoint.d/10-generate-certificate.sh

# SSL証明書を生成
RUN apk add --no-cache openssl && \
    mkdir -p /etc/nginx/ssl && \
    openssl req -x509 -nodes -days 365 \
      -newkey rsa:2048 \
      -keyout /etc/nginx/ssl/server.key \
      -out    /etc/nginx/ssl/server.crt \
      -subj "/C=JP/ST=Tokyo/L=Shinjuku/O=ft_transcendence/CN=localhost" \
      -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
      -addext "basicConstraints=critical,CA:FALSE" \
      -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
      -addext "extendedKeyUsage=serverAuth"

# Nginx 設定テンプレートをコピー（コンテナ起動時に /etc/nginx/conf.d/default.conf として出力される）
COPY default.conf.template /etc/nginx/templates/conf.d/default.conf.template
COPY modsecurity.conf      /etc/modsecurity.d/owasp-crs/rules/REQUEST-900-FT-TRANSCENDENCE.conf

EXPOSE 8080 8443
