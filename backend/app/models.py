from datetime import datetime

from sqlalchemy import ForeignKey, Index, JSON, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class User(Base):
    __tablename__ = "user"
    id: Mapped[str] = mapped_column(String, primary_key=True)  # provider 'sub'
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Cart(Base):
    __tablename__ = "cart"
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"), primary_key=True)
    items: Mapped[dict] = mapped_column(JSON, default=dict)  # {productId: qty}
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())


class Preference(Base):
    __tablename__ = "preference"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"))
    kind: Mapped[str] = mapped_column(String)  # 'avoid_brand' | 'note'
    value: Mapped[str] = mapped_column(String)


class Order(Base):
    __tablename__ = "order"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"))
    order_no: Mapped[str] = mapped_column(String)
    date: Mapped[str] = mapped_column(String)  # ISO date string (matches the frontend)
    subtotal: Mapped[float] = mapped_column(Numeric(10, 2))
    total: Mapped[float] = mapped_column(Numeric(10, 2))
    status: Mapped[str] = mapped_column(String, default="placed")  # placed | paid
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    items: Mapped[list["OrderItem"]] = relationship(cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_item"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("order.id"))
    product_id: Mapped[str] = mapped_column(String)
    name: Mapped[str] = mapped_column(String)
    price: Mapped[float] = mapped_column(Numeric(10, 2))
    qty: Mapped[int] = mapped_column()
    warranty_years: Mapped[int | None] = mapped_column(nullable=True)
    consumable: Mapped[str | None] = mapped_column(String, nullable=True)


Index("ix_pref_user", Preference.user_id)
Index("ix_order_user", Order.user_id)
