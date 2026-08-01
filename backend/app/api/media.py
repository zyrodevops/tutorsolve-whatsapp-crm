import logging
import re
import requests
from flask import Blueprint, jsonify, Response, stream_with_context
from app.core.auth_middleware import require_role
from app.core.config import WHATSAPP_ACCESS_TOKEN

logger = logging.getLogger(__name__)

bp = Blueprint('media', __name__, url_prefix='/api/media')

# Meta media IDs are purely numeric (see Cloud API docs). Rejecting anything
# else here means we never forward attacker-controlled input into a URL we
# call with our own access token.
MEDIA_ID_PATTERN = re.compile(r"^\d+$")

@bp.route('/<media_id>', methods=['GET'])
@require_role('ADMIN', 'MANAGER', 'AGENT')
def proxy_media(media_id):
    if not MEDIA_ID_PATTERN.match(media_id):
        return jsonify({"status": "error", "message": "Invalid media id"}), 400

    if not WHATSAPP_ACCESS_TOKEN:
        return jsonify({"status": "error", "message": "Missing WhatsApp token"}), 500

    headers = {
        "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}"
    }

    # Step 1: Get the download URL from Meta
    meta_url = f"https://graph.facebook.com/v20.0/{media_id}"
    try:
        url_resp = requests.get(meta_url, headers=headers, timeout=10)
        url_resp.raise_for_status()
        url_data = url_resp.json()
        download_url = url_data.get("url")
        mime_type = url_data.get("mime_type", "application/octet-stream")

        if not download_url:
            return jsonify({"status": "error", "message": "Media URL not found in Meta response"}), 404

    except requests.exceptions.RequestException as e:
        status = getattr(e.response, "status_code", 500)
        body = getattr(e.response, "text", str(e))
        logger.warning("Failed to get media info from Meta (HTTP %s): %s", status, body)
        return jsonify({"status": "error", "message": "Failed to get media info from Meta"}), status

    # Step 2: Stream the binary data from Meta to the frontend
    try:
        # stream=True ensures we don't load huge files into RAM
        media_resp = requests.get(download_url, headers=headers, stream=True, timeout=30)
        media_resp.raise_for_status()

        def generate():
            for chunk in media_resp.iter_content(chunk_size=8192):
                if chunk:
                    yield chunk

        return Response(stream_with_context(generate()), content_type=mime_type)

    except requests.exceptions.RequestException as e:
        status = getattr(e.response, "status_code", 500)
        body = getattr(e.response, "text", str(e))
        logger.warning("Failed to download media from Meta (HTTP %s): %s", status, body)
        return jsonify({"status": "error", "message": "Failed to download media from Meta"}), status
