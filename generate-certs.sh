#!/usr/bin/env bash
# ============================================================================
# generate-certs.sh
# Generates a local root CA and a wildcard TLS certificate for
# *.house-finance.local  (covers web.house-finance.local & api.house-finance.local)
#
# Usage:  bash ./generate-certs.sh
# ============================================================================
set -euo pipefail

CERT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/certs"
mkdir -p "$CERT_DIR"

echo ">>> Generating local CA and wildcard certificate for *.house-finance.local"
echo "    Output directory: $CERT_DIR"
echo ""

# ── 1. Root Certificate Authority ───────────────────────────────────────────
echo "[1/4] Generating root CA key and certificate..."

openssl genrsa -out "$CERT_DIR/ca.key" 4096 2>/dev/null

cat > "$CERT_DIR/ca.cnf" << 'EOF'
[req]
prompt             = no
default_bits       = 4096
default_md         = sha256
distinguished_name = dn
x509_extensions    = v3_ca

[dn]
C  = US
ST = Local
L  = Local
O  = house-finance Local CA
OU = Development
CN = house-finance Root CA

[v3_ca]
subjectKeyIdentifier   = hash
authorityKeyIdentifier = keyid:always,issuer
basicConstraints       = critical,CA:true
keyUsage               = critical,digitalSignature,cRLSign,keyCertSign
EOF

openssl req -new -x509 -days 3650 \
  -key    "$CERT_DIR/ca.key" \
  -out    "$CERT_DIR/ca.crt" \
  -config "$CERT_DIR/ca.cnf"

# ── 2. Wildcard Certificate Key ──────────────────────────────────────────────
echo "[2/4] Generating wildcard certificate key..."

openssl genrsa -out "$CERT_DIR/house-finance.key" 2048 2>/dev/null

# ── 3. CSR + Extension Config ────────────────────────────────────────────────
echo "[3/4] Creating CSR and SANs extension..."

cat > "$CERT_DIR/house-finance-san.cnf" << 'EOF'
[req]
default_bits        = 2048
prompt              = no
default_md          = sha256
req_extensions      = req_ext
distinguished_name  = dn

[dn]
C  = US
ST = Local
L  = Local
O  = house-finance
CN = *.house-finance.local

[req_ext]
subjectAltName = @alt_names

[alt_names]
DNS.1 = *.house-finance.local
DNS.2 = house-finance.local
DNS.3 = web.house-finance.local
DNS.4 = api.house-finance.local
EOF

openssl req -new \
  -key    "$CERT_DIR/house-finance.key" \
  -out    "$CERT_DIR/house-finance.csr" \
  -config "$CERT_DIR/house-finance-san.cnf"

# ── 4. Sign with Root CA ─────────────────────────────────────────────────────
echo "[4/4] Signing certificate with root CA..."

cat > "$CERT_DIR/house-finance-ext.cnf" << 'EOF'
authorityKeyIdentifier = keyid,issuer
basicConstraints       = CA:FALSE
keyUsage               = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
extendedKeyUsage       = serverAuth
subjectAltName         = @alt_names

[alt_names]
DNS.1 = *.house-finance.local
DNS.2 = house-finance.local
DNS.3 = web.house-finance.local
DNS.4 = api.house-finance.local
EOF

openssl x509 -req \
  -in         "$CERT_DIR/house-finance.csr" \
  -CA         "$CERT_DIR/ca.crt" \
  -CAkey      "$CERT_DIR/ca.key" \
  -CAcreateserial \
  -out        "$CERT_DIR/house-finance.crt" \
  -days       825 \
  -sha256 \
  -extfile    "$CERT_DIR/house-finance-ext.cnf"

# ── Verify ───────────────────────────────────────────────────────────────────
echo ""
echo "Certificate info:"
openssl x509 -in "$CERT_DIR/house-finance.crt" -noout -subject -issuer -dates

echo ""
echo "============================================================"
echo " Certificates generated successfully!"
echo "============================================================"
echo ""
echo " Files:"
echo "   CA cert   : $CERT_DIR/ca.crt   (trust this on your host)"
echo "   TLS cert  : $CERT_DIR/house-finance.crt"
echo "   TLS key   : $CERT_DIR/house-finance.key"
echo ""
echo " To trust the CA:"
echo ""
echo "   macOS:"
echo "     sudo security add-trusted-cert -d -r trustRoot \\"
echo "       -k /Library/Keychains/System.keychain $CERT_DIR/ca.crt"
echo ""
echo "   Ubuntu/Debian:"
echo "     sudo cp $CERT_DIR/ca.crt /usr/local/share/ca-certificates/house-finance-ca.crt"
echo "     sudo update-ca-certificates"
echo ""
echo "   Windows (PowerShell as Administrator):"
echo "     Import-Certificate -FilePath '$CERT_DIR\\ca.crt' \\"
echo "       -CertStoreLocation Cert:\\LocalMachine\\Root"
echo ""
echo " Add to hosts file (/etc/hosts or C:\\Windows\\System32\\drivers\\etc\\hosts):"
echo "   127.0.0.1  web.house-finance.local"
echo "   127.0.0.1  api.house-finance.local"
echo "   127.0.0.1  house-finance.local"
