import os
from unittest.mock import patch, MagicMock
import httpx

from . import test_main  # noqa: F401 - ensures env setup
from backend import main


def test_send_push_notification_success(monkeypatch):
    monkeypatch.setattr(main, "PUSH_CHANNEL", "0x" + "1" * 40)
    mock_response = MagicMock(status_code=202)
    mock_response.raise_for_status.return_value = None
    with patch("backend.main.httpx.post", return_value=mock_response) as mock_post:
        result = main.send_push_notification("title", "body", ["0x" + "2" * 40])
        assert result is True
        mock_response.raise_for_status.assert_called_once()
        mock_post.assert_called_once()


def test_send_push_notification_http_error(monkeypatch):
    monkeypatch.setattr(main, "PUSH_CHANNEL", "0x" + "1" * 40)
    mock_response = MagicMock(status_code=500)

    def _raise():
        raise httpx.HTTPStatusError("boom", request=MagicMock(), response=mock_response)

    mock_response.raise_for_status.side_effect = _raise
    with patch("backend.main.httpx.post", return_value=mock_response):
        result = main.send_push_notification("title", "body")
        assert result is False
