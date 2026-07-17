/**
 * Deterministic fake data — a seeded LCG so every reload shows the same rows.
 */

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

const FIRST_NAMES = ["林", "陈", "黄", "张", "李", "王", "吴", "刘", "蔡", "杨", "许", "郑", "谢", "郭", "洪"];
const LAST_NAMES = ["伟", "芳", "娜", "敏", "静", "磊", "军", "洋", "勇", "艳", "杰", "涛", "明", "超", "秀兰"];
const ROLES = ["工程师", "设计师", "产品经理", "运营", "测试"];
const STATUSES: Array<Person["status"]> = ["active", "invited", "suspended"];

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

export function makePeople(count: number, seed = 7): Person[] {
  const rng = makeRng(seed);

  return Array.from({ length: count }, (_, index) => {
    const name = `${pick(rng, FIRST_NAMES)}${pick(rng, LAST_NAMES)}`;

    return {
      id: `p-${index + 1}`,
      name,
      email: `user${index + 1}@example.com`,
      role: pick(rng, ROLES),
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

/**
 * A hand-crafted admin-panel menu tree — realistic RBAC shapes beat generated noise here.
 */
export function makeMenus(): MenuItem[] {
  const action = (
    id: string,
    name: string,
    permission: string,
    order: number,
    status: MenuItem["status"] = "enabled"
  ): MenuItem => {
    return {
      id,
      name,
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
      name: "仪表盘",
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
      name: "系统管理",
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
          name: "用户管理",
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
            action("system-users-create", "新增用户", "system:user:create", 1),
            action("system-users-update", "编辑用户", "system:user:update", 2),
            action("system-users-delete", "删除用户", "system:user:delete", 3, "disabled"),
            action("system-users-reset", "重置密码", "system:user:reset-password", 4)
          ]
        },
        {
          id: "system-roles",
          name: "角色管理",
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
            action("system-roles-create", "新增角色", "system:role:create", 1),
            action("system-roles-grant", "分配权限", "system:role:grant", 2),
            action("system-roles-delete", "删除角色", "system:role:delete", 3)
          ]
        },
        {
          id: "system-menus",
          name: "菜单管理",
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
            action("system-menus-create", "新增菜单", "system:menu:create", 1),
            action("system-menus-update", "编辑菜单", "system:menu:update", 2),
            action("system-menus-delete", "删除菜单", "system:menu:delete", 3, "disabled")
          ]
        },
        {
          id: "system-departments",
          name: "部门管理",
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
      name: "内容管理",
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
          name: "文章列表",
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
            action("content-articles-publish", "发布文章", "content:article:publish", 1),
            action("content-articles-retract", "下架文章", "content:article:retract", 2)
          ]
        },
        {
          id: "content-categories",
          name: "分类管理",
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
          name: "评论审核",
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
      name: "监控中心",
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
          name: "在线用户",
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
          name: "操作日志",
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
          name: "服务监控",
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

export function makeRegions(): Region[] {
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
        children.push(region(`${name}-${index + 1} 区`, depth + 1));
      }

      node.children = children;
    }

    return node;
  };

  return [region("华东", 0), region("华南", 0), region("华北", 0)];
}
