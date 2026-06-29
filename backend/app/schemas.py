from pydantic import BaseModel, Field


# These mirror the frontend localStorage shapes 1:1 so migration is a straight copy.

class CartIn(BaseModel):
    items: dict[str, int] = Field(default_factory=dict)  # {productId: qty}


class CartOut(BaseModel):
    items: dict[str, int]


class PrefIn(BaseModel):
    kind: str  # 'avoid_brand' | 'note'
    value: str


class OrderItemIn(BaseModel):
    id: str
    name: str
    price: float
    qty: int = 1
    warrantyYears: int | None = None
    consumable: str | None = None


class OrderIn(BaseModel):
    orderNo: str
    dateISO: str
    subtotal: float
    total: float
    items: list[OrderItemIn]


class Me(BaseModel):
    id: str
    email: str | None = None
