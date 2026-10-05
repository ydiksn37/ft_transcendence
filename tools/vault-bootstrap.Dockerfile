FROM hashicorp/vault:1.18 AS vault-source

FROM node:22-alpine
RUN apk add --no-cache openssl postgresql-client
COPY --from=vault-source /bin/vault /usr/local/bin/vault
COPY tools/vault-bootstrap.sh /usr/local/bin/vault-bootstrap
RUN chmod 755 /usr/local/bin/vault-bootstrap
ENTRYPOINT ["/usr/local/bin/vault-bootstrap"]
