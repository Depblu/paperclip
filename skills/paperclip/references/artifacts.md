# Generated Artifacts and Work Products

工作产出用户可检查文件时，最终处置前先上传到当前 issue。只给本地文件系统路径不够，因为 board users、reviewers 和 cloud operators 可能无法访问 agent workspace。

使用本 skill 自带 helper。在已安装的 `paperclip` skill 目录中，helper 位于 `scripts/paperclip-upload-artifact.sh`：

```bash
scripts/paperclip-upload-artifact.sh path/to/output.webm \
  --title "Walkthrough render" \
  --summary "Rendered walkthrough for review"
```

helper 使用 `PAPERCLIP_API_URL`、`PAPERCLIP_API_KEY`、`PAPERCLIP_COMPANY_ID`、`PAPERCLIP_TASK_ID` 和 `PAPERCLIP_RUN_ID`。它会把文件上传为 issue attachment，默认创建由 attachment 支撑的 artifact work product，并打印可直接放进最终评论的 issue-safe markdown links。

如果 helper 不可用，直接使用 Paperclip API：

```bash
curl -sS -X POST \
  "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/issues/$PAPERCLIP_TASK_ID/attachments" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -F 'file=@"path/to/output.webm";type=video/webm'
```

当该文件本身就是交付物时，继续创建 work product。服务器会从 `attachmentId` 规范化 attachment-backed artifact metadata：

```bash
curl -sS -X POST \
  "$PAPERCLIP_API_URL/api/issues/$PAPERCLIP_TASK_ID/work-products" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  --data-binary '{
    "type": "artifact",
    "provider": "paperclip",
    "title": "Walkthrough render",
    "status": "ready_for_review",
    "reviewState": "needs_board_review",
    "isPrimary": true,
    "metadata": { "attachmentId": "<uploaded-attachment-id>" }
  }'
```

最终 issue 评论中链接已上传的 attachment 或 work product，并说明内容。不要让产出 artifact 的工作只带本地路径或 `Remaining` note 就停在 `in_progress`。
