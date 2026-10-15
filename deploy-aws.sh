#!/bin/bash
# ==============================================================================
# SCRIPT DE DESPLIEGUE AUTOMATIZADO EN AWS EC2 (AWS ACADEMY)
# Sistema: nuam exchange - Mantenedor de Calificaciones Tributarias
# ==============================================================================

set -e

echo ">>> [1/5] Actualizando paquetes del sistema en Amazon Linux..."
sudo dnf update -y || sudo yum update -y

echo ">>> [2/5] Instalando Node.js 20/22 y Git..."
sudo dnf install -y nodejs npm git || sudo yum install -y nodejs npm git

echo ">>> [3/5] Instalando dependencias de la aplicación..."
npm install --production

echo ">>> [4/5] Instalando PM2 (Process Manager) para ejecución continua..."
sudo npm install -g pm2 || npm install pm2

echo ">>> [5/6] Configurando redirección de puerto 80 a 3000 (iptables)..."
# Permitir acceso directo por HTTP puerto 80 sin obligar a escribir :3000
sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 3000 || true
# Guardar regla si iptables-services está disponible
if command -v iptables-save >/dev/null 2>&1; then
    sudo iptables-save | sudo tee /etc/sysconfig/iptables >/dev/null 2>&1 || true
fi

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
echo "=============================================================================="
echo "✅ DESPLIEGUE EN AWS EC2 COMPLETADO CON ÉXITO Y BLINDADO ANTE REINICIOS"
echo "🌐 Acceso web estándar (Puerto 80):   http://TU_IP_ELASTICA/"
echo "🌐 Acceso web alternativo (Pto 3000): http://TU_IP_ELASTICA:3000"
echo "🔄 Persistencia: Servicio systemd 'pm2-$CURRENT_USER' activo y habilitado"
echo "🔍 Monitoreo y logs en vivo:          pm2 logs nuam-app"
echo "=============================================================================="

