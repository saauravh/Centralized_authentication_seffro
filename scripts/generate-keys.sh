#!/bin/bash
# Generate RS256 key pair for JWT signing
# Usage: bash scripts/generate-keys.sh

KEYS_DIR="./keys"
mkdir -p "$KEYS_DIR"

echo "Generating RSA 4096-bit private key..."
openssl genrsa -out "$KEYS_DIR/private.pem" 4096

echo "Extracting public key..."
openssl rsa -in "$KEYS_DIR/private.pem" -pubout -out "$KEYS_DIR/public.pem"

chmod 600 "$KEYS_DIR/private.pem"
chmod 644 "$KEYS_DIR/public.pem"

echo "Done! Keys generated:"
echo "  Private: $KEYS_DIR/private.pem"
echo "  Public:  $KEYS_DIR/public.pem"
