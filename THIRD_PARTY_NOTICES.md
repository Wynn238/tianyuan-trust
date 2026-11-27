# 第三方素材与许可说明

本仓库中自写代码按根目录 [LICENSE](LICENSE) 的 MIT 许可发布。以下第三方素材不适用 MIT，仍归各自权利人所有；使用、修改或再分发时请遵守对应许可。

## 1. VibeFather 运营后台视觉参考

- 模板：`e-commerce-admin-dashboard`
- 来源：<https://vibefather.ai/templates/e-commerce-admin-dashboard.md>
- 许可：**CC BY-NC 4.0（非商业）**；商业使用需要 VibeFather Pro。
- 说明：本仓库的运营后台视觉方向参考了该模板；公开副本不包含 VibeFather 模板目录。若将相关视觉用于商业项目，请先向 VibeFather 确认授权。该参考不改变本仓库自写代码的 MIT 许可，但第三方设计权利仍归其权利人。

## 2. 照片

商品与产地照片来自 Wikimedia Commons，具体文件名、作者、原始链接与许可写在：

```text
platform/public/assets/photos/CREDITS.md
```

包含 Public Domain、CC BY 2.0/3.0、CC BY-SA 3.0/4.0 等许可。再分发时请保留作者、来源和许可信息；CC BY-SA 素材的演绎使用需遵守相同方式共享要求。

## 3. JavaScript 库

| 文件 | 许可 |
|---|---|
| `platform/public/assets/vendor/three.min.js` | Three.js，MIT |
| `platform/public/assets/vendor/gsap.min.js` | GSAP，遵循文件头与 <https://gsap.com/licensing/> 的许可 |

## 4. Node.js 依赖

`platform/package-lock.json` 中的依赖由 npm 安装，各自遵循包内许可证；本仓库不复制其源码到 `platform/node_modules`。

## 5. 课程文档

`docs/reports/` 中的需求分析与智能体搭建说明由本项目组编写，随项目文档一并提供；如其中引用了第三方图表、照片或公开资料，以原文标注为准。

## 6. 使用提醒

如果你准备把本项目用于商业用途，请重点重新检查：

1. VibeFather 相关视觉是否需要商业授权；
2. 图片是否满足 CC BY-SA 的署名与相同方式共享要求；
3. GSAP 的使用场景是否落在其许可范围内；
4. 演示数据中是否还包含真实个人信息。

如无法确认，建议替换为完全自有的设计、图片和字体，或删除对应素材后再发布。
