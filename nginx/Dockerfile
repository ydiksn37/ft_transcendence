FROM owasp/modsecurity-crs:nginx-alpine

USER root

# SSL証明書を生成
RUN apk add --no-cache openssl && \
    mkdir -p /etc/nginx/ssl && \
    openssl req -x509 -nodes -days 365 \
      -newkey rsa:2048 \
      -keyout /etc/nginx/ssl/server.key \
      -out    /etc/nginx/ssl/server.crt \
      -subj "/C=JP/ST=Tokyo/L=Tokyo/O=ft_transcendence/CN=localhost"

# Nginx 設定テンプレートをコピー（コンテナ起動時に /etc/nginx/conf.d/default.conf として出力される）
COPY default.conf.template /etc/nginx/templates/conf.d/default.conf.template
# The base image regenerates modsecurity-override.conf at container startup.
# Install project exclusions as a CRS request rule so they are not overwritten.
COPY modsecurity.conf      /etc/modsecurity.d/owasp-crs/rules/REQUEST-900-FT-TRANSCENDENCE.conf

EXPOSE 8080 8443
