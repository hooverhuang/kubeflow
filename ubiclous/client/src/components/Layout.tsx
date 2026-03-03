import React from 'react';
import './Layout.css';

type Props = {
  sidebar: React.ReactNode;
  children: React.ReactNode;
};

export default function Layout({ sidebar, children }: Props) {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="logo">ubicloud</span>
          <span className="logo-sub">ML Console</span>
        </div>
        {sidebar}
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
