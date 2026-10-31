// SPDX-License-Identifier: AGPL-3.0-only

import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setOverwriteOutput(true);
// The 3D mascot needs WebGL on the GPU, and its springs need frames drawn in order, in one tab.
Config.setChromiumOpenGlRenderer("angle");
Config.setConcurrency(1);
