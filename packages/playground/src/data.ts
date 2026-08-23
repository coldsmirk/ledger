/**
 * Deterministic fake data — a seeded LCG so every reload shows the same rows. Every generator
 * takes the active language: an English table of `林伟` would be a half-finished translation,
 * and the point of the switch is to show what each locale really looks like.
 */
import type { Copy, Lang } from "./i18n";

export interface Person {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "invited" | "suspended";
  age: number;
  balance: number;
  joinedAt: string;
}

export interface Region {
  id: string;
  name: string;
  revenue: number;
  children?: Region[];
}

export interface MenuItem {
  id: string;
  name: string;
  kind: "directory" | "menu" | "action";
  path?: string;
  component?: string;
  permission?: string;
  icon?: string;
  order: number;
  status: "enabled" | "disabled";
  visible: boolean;
  updatedAt: string;
  children?: MenuItem[];
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  spec: string;
  warehouse: string;
  price: number;
  stock: number;
  listed: boolean;
}

export interface OrderItem {
  id: string;
  product: string;
  unitPrice: number;
  quantity: number;
}

export interface Order {
  id: string;
  orderNo: string;
  customer: string;
  channel: "web" | "app" | "store" | "phone";
  status: "pending" | "paid" | "shipped" | "completed" | "cancelled";
  quantity: number;
  amount: number;
  placedAt: string;
  items: OrderItem[];
}

export interface LogEntry {
  id: string;
  time: string;
  level: "info" | "warn" | "error";
  actor: string;
  action: string;
  target: string;
  ip: string;
}

const GIVEN_NAMES: Copy<string[]> = {
  en: ["Ava", "Liam", "Noah", "Mia", "Ethan", "Zoe", "Owen", "Ivy", "Leo", "Nora", "Kai", "Elena", "Miles", "Ruby", "Jonas"],
  zh: ["林", "陈", "黄", "张", "李", "王", "吴", "刘", "蔡", "杨", "许", "郑", "谢", "郭", "洪"]
};
const FAMILY_NAMES: Copy<string[]> = {
  en: ["Bennett", "Carter", "Dawson", "Ellis", "Foster", "Grant", "Hayes", "Ingram", "Keller", "Lambert", "Mercer", "Novak", "Orton", "Pruitt", "Quinn"],
  zh: ["伟", "芳", "娜", "敏", "静", "磊", "军", "洋", "勇", "艳", "杰", "涛", "明", "超", "秀兰"]
};
const ROLES: Copy<string[]> = {
  en: ["Engineer", "Designer", "Product Manager", "Operations", "QA"],
  zh: ["工程师", "设计师", "产品经理", "运营", "测试"]
};
const STATUSES: Array<Person["status"]> = ["active", "invited", "suspended"];

/**
 * The pool the generated people are drawn from — a `select` editor has to offer the same set.
 */
export function roleOptions(lang: Lang): string[] {
  return ROLES[lang];
}

function makeRng(seed: number) {
  let state = seed;

  return () => {
    state = (state * 48_271) % 2_147_483_647;

    return state / 2_147_483_647;
  };
}

function pick<T>(rng: () => number, items: T[]): T {
  const item = items[Math.floor(rng() * items.length)];

  if (item === undefined) {
    throw new Error("empty pool");
  }

  return item;
}

/**
 * Chinese writes family name first and joins tight; English is the other way around.
 */
function fullName(rng: () => number, lang: Lang): string {
  const given = pick(rng, GIVEN_NAMES[lang]);
  const family = pick(rng, FAMILY_NAMES[lang]);

  return lang === "zh" ? `${given}${family}` : `${given} ${family}`;
}

export function makePeople(lang: Lang, count: number, seed = 7): Person[] {
  const rng = makeRng(seed);

  return Array.from({ length: count }, (_, index) => {
    return {
      id: `p-${index + 1}`,
      name: fullName(rng, lang),
      email: `user${index + 1}@example.com`,
      role: pick(rng, ROLES[lang]),
      status: pick(rng, STATUSES),
      age: 22 + Math.floor(rng() * 40),
      balance: Math.round(rng() * 100_000) / 100,
      joinedAt: isoDate(rng)
    };
  });
}

function isoDate(rng: () => number): string {
  const month = Math.floor(rng() * 36);
  const day = 1 + Math.floor(rng() * 28);

  return new Date(Date.UTC(2023, month, day)).toISOString().slice(0, 10);
}

const PRODUCT_NAMES: Copy<string[]> = {
  en: [
    "Wireless Mouse",
    "Mechanical Keyboard",
    "Monitor Arm",
    "Noise-Cancelling Headset",
    "Portable SSD",
    "Webcam",
    "Docking Station",
    "Gaming Chair",
    "Standing Desk",
    "Conference Speaker",
    "Laser Printer",
    "Paper Shredder",
    "Projector",
    "Whiteboard Kit",
    "Filing Cabinet"
  ],
  zh: [
    "无线鼠标",
    "机械键盘",
    "显示器支架",
    "降噪耳机",
    "便携硬盘",
    "网络摄像头",
    "扩展坞",
    "电竞椅",
    "升降桌",
    "会议音箱",
    "激光打印机",
    "碎纸机",
    "投影仪",
    "白板套装",
    "文件柜"
  ]
};
const PRODUCT_SPECS: Copy<string[]> = {
  en: ["Standard", "Pro", "Ultra", "Lite"],
  zh: ["标准版", "专业版", "旗舰版", "青春版"]
};
/**
 * Bin codes read the same in both languages, so they are data rather than copy.
 */
export const WAREHOUSES = ["A-01", "A-02", "B-01", "B-02", "C-01"];

export function makeProducts(lang: Lang, count: number, seed = 23): Product[] {
  const rng = makeRng(seed);

  return Array.from({ length: count }, (_, index) => {
    return {
      id: `sku-${index + 1}`,
      sku: `SKU-${String(index + 1).padStart(4, "0")}`,
      name: pick(rng, PRODUCT_NAMES[lang]),
      spec: pick(rng, PRODUCT_SPECS[lang]),
      warehouse: pick(rng, WAREHOUSES),
      price: Math.round(rng() * 200_000) / 100,
      stock: Math.floor(rng() * 500),
      listed: rng() > 0.25
    };
  });
}

const ORDER_CHANNELS: Array<Order["channel"]> = ["web", "app", "store", "phone"];
const ORDER_STATUSES: Array<Order["status"]> = ["pending", "paid", "shipped", "completed", "cancelled"];

export function makeOrders(lang: Lang, count: number, seed = 31): Order[] {
  const rng = makeRng(seed);

  return Array.from({ length: count }, (_, index) => {
    const itemCount = 1 + Math.floor(rng() * 4);
    const items: OrderItem[] = Array.from({ length: itemCount }, (_, itemIndex) => {
      return {
        id: `oi-${index + 1}-${itemIndex + 1}`,
        product: pick(rng, PRODUCT_NAMES[lang]),
        unitPrice: Math.round(rng() * 80_000) / 100,
        quantity: 1 + Math.floor(rng() * 5)
      };
    });

    return {
      id: `o-${index + 1}`,
      orderNo: `SO-2025-${String(index + 1).padStart(5, "0")}`,
      customer: fullName(rng, lang),
      channel: pick(rng, ORDER_CHANNELS),
      status: pick(rng, ORDER_STATUSES),
      quantity: items.reduce((sum, item) => sum + item.quantity, 0),
      amount: Math.round(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) * 100) / 100,
      placedAt: isoDate(rng),
      items
    };
  });
}

const LOG_LEVELS: Array<LogEntry["level"]> = ["info", "info", "info", "info", "warn", "warn", "error"];
const LOG_ACTIONS: Copy<string[]> = {
  en: [
    "Signed in",
    "Exported a report",
    "Updated configuration",
    "Deleted a record",
    "Created a workflow",
    "Approved a request",
    "Rejected a request",
    "Reset a password",
    "Changed permissions",
    "Archived a project"
  ],
  zh: ["登录系统", "导出报表", "更新配置", "删除记录", "新建流程", "审批通过", "驳回申请", "重置密码", "调整权限", "归档项目"]
};
const LOG_TARGETS: Copy<string[]> = {
  en: ["Orders", "User Center", "Reporting", "Workflow Engine", "Message Gateway", "Billing"],
  zh: ["订单模块", "用户中心", "报表中心", "工作流引擎", "消息网关", "计费系统"]
};

export function makeLogs(lang: Lang, count: number, seed = 47): LogEntry[] {
  const rng = makeRng(seed);
  // A fixed anchor keeps the stream deterministic; entries walk backwards a few seconds each.
  let cursor = Date.UTC(2025, 6, 17, 12, 0, 0);

  return Array.from({ length: count }, (_, index) => {
    cursor -= Math.floor(rng() * 20_000) + 1000;

    return {
      id: `log-${index + 1}`,
      time: new Date(cursor).toISOString().slice(0, 19).replace("T", " "),
      level: pick(rng, LOG_LEVELS),
      actor: fullName(rng, lang),
      action: pick(rng, LOG_ACTIONS[lang]),
      target: pick(rng, LOG_TARGETS[lang]),
      ip: `10.${Math.floor(rng() * 255)}.${Math.floor(rng() * 255)}.${Math.floor(rng() * 255)}`
    };
  });
}

/**
 * Node labels for the admin menu below, keyed by node id so the tree itself stays written once.
 * `MenuId` is derived from the English side, so a missing translation is a typecheck failure.
 */
const MENU_NAMES_EN = {
  dashboard: "Dashboard",
  system: "System",
  "system-users": "Users",
  "system-users-create": "Create user",
  "system-users-update": "Edit user",
  "system-users-delete": "Delete user",
  "system-users-reset": "Reset password",
  "system-roles": "Roles",
  "system-roles-create": "Create role",
  "system-roles-grant": "Grant permissions",
  "system-roles-delete": "Delete role",
  "system-menus": "Menus",
  "system-menus-create": "Create menu",
  "system-menus-update": "Edit menu",
  "system-menus-delete": "Delete menu",
  "system-departments": "Departments",
  content: "Content",
  "content-articles": "Articles",
  "content-articles-publish": "Publish article",
  "content-articles-retract": "Retract article",
  "content-categories": "Categories",
  "content-comments": "Comment review",
  monitor: "Monitoring",
  "monitor-online": "Online users",
  "monitor-logs": "Audit log",
  "monitor-services": "Services"
};

type MenuId = keyof typeof MENU_NAMES_EN;

const MENU_NAMES: Copy<Record<MenuId, string>> = {
  en: MENU_NAMES_EN,
  zh: {
    dashboard: "仪表盘",
    system: "系统管理",
    "system-users": "用户管理",
    "system-users-create": "新增用户",
    "system-users-update": "编辑用户",
    "system-users-delete": "删除用户",
    "system-users-reset": "重置密码",
    "system-roles": "角色管理",
    "system-roles-create": "新增角色",
    "system-roles-grant": "分配权限",
    "system-roles-delete": "删除角色",
    "system-menus": "菜单管理",
    "system-menus-create": "新增菜单",
    "system-menus-update": "编辑菜单",
    "system-menus-delete": "删除菜单",
    "system-departments": "部门管理",
    content: "内容管理",
    "content-articles": "文章列表",
    "content-articles-publish": "发布文章",
    "content-articles-retract": "下架文章",
    "content-categories": "分类管理",
    "content-comments": "评论审核",
    monitor: "监控中心",
    "monitor-online": "在线用户",
    "monitor-logs": "操作日志",
    "monitor-services": "服务监控"
  }
};

/**
 * A hand-crafted admin-panel menu tree — realistic RBAC shapes beat generated noise here.
 */
export function makeMenus(lang: Lang): MenuItem[] {
  const name = MENU_NAMES[lang];

  const action = (
    id: MenuId,
    permission: string,
    order: number,
    status: MenuItem["status"] = "enabled"
  ): MenuItem => {
    return {
      id,
      name: name[id],
      kind: "action",
      permission,
      order,
      status,
      visible: true,
      updatedAt: "2025-06-30"
    };
  };

  return [
    {
      id: "dashboard",
      name: name.dashboard,
      kind: "menu",
      path: "/dashboard",
      component: "views/dashboard/index",
      permission: "dashboard:view",
      icon: "gauge",
      order: 1,
      status: "enabled",
      visible: true,
      updatedAt: "2025-07-02"
    },
    {
      id: "system",
      name: name.system,
      kind: "directory",
      path: "/system",
      icon: "settings",
      order: 2,
      status: "enabled",
      visible: true,
      updatedAt: "2025-07-11",
      children: [
        {
          id: "system-users",
          name: name["system-users"],
          kind: "menu",
          path: "/system/users",
          component: "views/system/users/index",
          permission: "system:user:list",
          icon: "users",
          order: 1,
          status: "enabled",
          visible: true,
          updatedAt: "2025-07-11",
          children: [
            action("system-users-create", "system:user:create", 1),
            action("system-users-update", "system:user:update", 2),
            action("system-users-delete", "system:user:delete", 3, "disabled"),
            action("system-users-reset", "system:user:reset-password", 4)
          ]
        },
        {
          id: "system-roles",
          name: name["system-roles"],
          kind: "menu",
          path: "/system/roles",
          component: "views/system/roles/index",
          permission: "system:role:list",
          icon: "shield",
          order: 2,
          status: "enabled",
          visible: true,
          updatedAt: "2025-06-19",
          children: [
            action("system-roles-create", "system:role:create", 1),
            action("system-roles-grant", "system:role:grant", 2),
            action("system-roles-delete", "system:role:delete", 3)
          ]
        },
        {
          id: "system-menus",
          name: name["system-menus"],
          kind: "menu",
          path: "/system/menus",
          component: "views/system/menus/index",
          permission: "system:menu:list",
          icon: "list-tree",
          order: 3,
          status: "enabled",
          visible: true,
          updatedAt: "2025-07-08",
          children: [
            action("system-menus-create", "system:menu:create", 1),
            action("system-menus-update", "system:menu:update", 2),
            action("system-menus-delete", "system:menu:delete", 3, "disabled")
          ]
        },
        {
          id: "system-departments",
          name: name["system-departments"],
          kind: "menu",
          path: "/system/departments",
          component: "views/system/departments/index",
          permission: "system:department:list",
          icon: "building",
          order: 4,
          status: "enabled",
          visible: true,
          updatedAt: "2025-05-27"
        }
      ]
    },
    {
      id: "content",
      name: name.content,
      kind: "directory",
      path: "/content",
      icon: "notebook",
      order: 3,
      status: "enabled",
      visible: true,
      updatedAt: "2025-06-24",
      children: [
        {
          id: "content-articles",
          name: name["content-articles"],
          kind: "menu",
          path: "/content/articles",
          component: "views/content/articles/index",
          permission: "content:article:list",
          icon: "article",
          order: 1,
          status: "enabled",
          visible: true,
          updatedAt: "2025-06-24",
          children: [
            action("content-articles-publish", "content:article:publish", 1),
            action("content-articles-retract", "content:article:retract", 2)
          ]
        },
        {
          id: "content-categories",
          name: name["content-categories"],
          kind: "menu",
          path: "/content/categories",
          component: "views/content/categories/index",
          permission: "content:category:list",
          icon: "category",
          order: 2,
          status: "enabled",
          visible: true,
          updatedAt: "2025-04-15"
        },
        {
          id: "content-comments",
          name: name["content-comments"],
          kind: "menu",
          path: "/content/comments",
          component: "views/content/comments/index",
          permission: "content:comment:review",
          icon: "message",
          order: 3,
          status: "disabled",
          visible: true,
          updatedAt: "2025-03-02"
        }
      ]
    },
    {
      id: "monitor",
      name: name.monitor,
      kind: "directory",
      path: "/monitor",
      icon: "activity",
      order: 4,
      status: "enabled",
      visible: true,
      updatedAt: "2025-07-15",
      children: [
        {
          id: "monitor-online",
          name: name["monitor-online"],
          kind: "menu",
          path: "/monitor/online",
          component: "views/monitor/online/index",
          permission: "monitor:online:list",
          icon: "user-check",
          order: 1,
          status: "enabled",
          visible: true,
          updatedAt: "2025-07-15"
        },
        {
          id: "monitor-logs",
          name: name["monitor-logs"],
          kind: "menu",
          path: "/monitor/logs",
          component: "views/monitor/logs/index",
          permission: "monitor:log:list",
          icon: "history",
          order: 2,
          status: "enabled",
          visible: true,
          updatedAt: "2025-07-01"
        },
        {
          id: "monitor-services",
          name: name["monitor-services"],
          kind: "menu",
          path: "/monitor/services",
          component: "views/monitor/services/index",
          permission: "monitor:service:list",
          icon: "server",
          order: 3,
          status: "enabled",
          visible: false,
          updatedAt: "2025-06-06"
        }
      ]
    }
  ];
}

const REGION_ROOTS: Copy<string[]> = {
  en: ["East", "South", "North"],
  zh: ["华东", "华南", "华北"]
};

export function makeRegions(lang: Lang): Region[] {
  const rng = makeRng(11);
  let counter = 0;

  const region = (name: string, depth: number): Region => {
    counter += 1;

    const node: Region = {
      id: `r-${counter}`,
      name,
      revenue: Math.round(rng() * 90_000 + 10_000)
    };

    if (depth < 2) {
      const childCount = 2 + Math.floor(rng() * 2);
      const children: Region[] = [];

      for (let index = 0; index < childCount; index += 1) {
        const childName = lang === "zh" ? `${name}-${index + 1} 区` : `${name} ${index + 1}`;

        children.push(region(childName, depth + 1));
      }

      node.children = children;
    }

    return node;
  };

  return REGION_ROOTS[lang].map(root => region(root, 0));
}
