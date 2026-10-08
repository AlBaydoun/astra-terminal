"""Choose a market-order policy from broker flags, not order-enum numbers."""
def market_filling(mt5, info):
    if info is None:
        raise ValueError('Contract specification unavailable')
    flags = int(getattr(info, 'filling_mode', 0))
    execution = getattr(info, 'trade_exemode', None)
    # SYMBOL_FILLING_FOK=1 and SYMBOL_FILLING_IOC=2 are bit flags;
    # ORDER_FILLING_FOK=0 and ORDER_FILLING_IOC=1 are different enums.
    if flags & 1:
        return mt5.ORDER_FILLING_FOK
    if flags & 2:
        return mt5.ORDER_FILLING_IOC
    if execution in (0, 1):  # Request / Instant execution permits FOK.
        return mt5.ORDER_FILLING_FOK
    if execution == 3:  # Exchange permits RETURN; Market execution never does.
        return mt5.ORDER_FILLING_RETURN
    raise ValueError('Broker reports no supported market-order filling policy')
