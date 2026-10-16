#!/bin/bash
# Script de despliegue en AWS EC2 (Amazon Linux 2023)
# Sistema: nuam exchange - Mantenedor de Calificaciones Tributarias


set -e

echo ">>> [1/6] Actualizando paquetes del sistema en Amazon Linux..."
sudo dnf update -y || sudo yum update -y

echo ">>> [2/6] Instalando Node.js 20, Nginx, Git y herramientas de compilación..."
sudo dnf install -y nodejs20 nodejs20-npm nginx git gcc-c++ make python3 || sudo dnf install -y nodejs npm nginx git gcc-c++ make python3 || sudo yum install -y nodejs npm nginx git gcc-c++ make python3

echo ">>> [3/6] Preparando configuración de entorno e instalando dependencias..."
if [ ! -f .env ]; then
    echo "PORT=3000" > .env
    echo "NODE_ENV=production" >> .env
fi
npm install --production

echo ">>> [4/6] Configurando Nginx Reverse Proxy (Puerto 80 -> 3000)..."
if [ -f nginx.conf ]; then
    sudo cp nginx.conf /etc/nginx/conf.d/nuam.conf
    # Asegurar que el server por defecto de nginx no colisione
    sudo sed -i 's/listen       80;/listen       8080;/g' /etc/nginx/nginx.conf 2>/dev/null || true
    sudo sed -i 's/listen       \[::\]:80;/listen       \[::\]:8080;/g' /etc/nginx/nginx.conf 2>/dev/null || true
    sudo sed -i 's/listen       80 default_server;/listen       8080 default_server;/g' /etc/nginx/nginx.conf 2>/dev/null || true
    sudo sed -i 's/listen       \[::\]:80 default_server;/listen       \[::\]:8080 default_server;/g' /etc/nginx/nginx.conf 2>/dev/null || true
    if [ -f /etc/nginx/conf.d/default.conf ]; then
        sudo mv /etc/nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf.bak 2>/dev/null || true
    fi
    sudo nginx -t
    sudo systemctl enable nginx
    sudo systemctl restart nginx
fi

echo ">>> [5/6] Instalando PM2 (Process Manager) para ejecución continua..."
sudo npm install -g pm2 || npm install pm2
export PATH="./node_modules/.bin:$PATH"

echo ">>> [6/6] Iniciando la aplicación con PM2 y registrando demonio systemd..."
# Obtener usuario y home actual
CURRENT_USER=$(whoami)
USER_HOME=$HOME

# Detener instancia previa si existía
pm2 delete nuam-app 2>/dev/null || true
pm2 start src/server.js --name "nuam-app" --env PORT=3000

# Guardar lista de procesos en PM2
pm2 save

# Registrar PM2 como servicio del sistema operativo (systemd) para sobrevivir reinicios de AWS Academy
echo ">>> Configurando persistencia automática tras reinicio de máquina (AWS Academy 4h timeout)..."
STARTUP_CMD=$(pm2 startup systemd -u "$CURRENT_USER" --hp "$USER_HOME" | grep "sudo env PATH" | head -n 1)
if [ -n "$STARTUP_CMD" ]; then
    echo "Ejecutando: $STARTUP_CMD"
    eval "$STARTUP_CMD"
else
    # Fallback directo con valores detectados
    sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u "$CURRENT_USER" --hp "$USER_HOME" 2>/dev/null || true
fi

pm2 save

echo ""
echo "Estado del despliegue en AWS EC2:"
IMDS_TOKEN=$(curl -s --connect-timeout 2 -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)
if [ -n "$IMDS_TOKEN" ]; then
    PUBLIC_IP=$(curl -s -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "54.165.130.63")
else
    PUBLIC_IP=$(curl -s --connect-timeout 2 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "54.165.130.63")
fi
echo "Acceso web: http://${PUBLIC_IP}/"
echo "Persistencia: Servicio systemd 'pm2-$CURRENT_USER' y 'nginx' habilitados"
echo "Monitoreo:    pm2 logs nuam-app"

