# 改动优先的无冲突 Merge（优先保留当前分支）

当你希望“当前分支（例如 `work`）的改动优先”，并尽量避免冲突中断时，可使用以下流程。

## 一次性命令

```bash
git checkout work
git fetch origin
git merge -X ours origin/main -m "merge: prioritize work changes"
```

说明：
- `-X ours` 表示当同一位置出现冲突时，优先采用**当前分支**（`work`）的内容。
- 非冲突区域仍会正常合并对方分支的改动。

## 如果你希望更稳妥（先预演）

```bash
git checkout work
git fetch origin
git merge --no-commit --no-ff -X ours origin/main
# 检查结果后：
git commit -m "merge: prioritize work changes"
```

## 合并后检查

```bash
git status
git log --oneline --graph -n 10
```

## 注意

- `-X ours` 只在“冲突块”里偏向当前分支，不是完全忽略对方分支。
- 如果你要完全以当前分支文件覆盖对方，可在冲突时用：

```bash
git checkout --ours <file>
git add <file>
```

