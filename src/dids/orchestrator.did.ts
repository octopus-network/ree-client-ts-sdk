export const idlFactory = ({ IDL }: { IDL: any }) => {
  const AbandonExchangeArgs = IDL.Record({
    exchange_id: IDL.Text,
    reason: IDL.Text,
  });
  const Result = IDL.Variant({ Ok: IDL.Null, Err: IDL.Text });
  const TxOutputType = IDL.Variant({
    P2WPKH: IDL.Null,
    OpReturn: IDL.Nat64,
    P2SH: IDL.Null,
    P2TR: IDL.Null,
  });
  const EstimateMinTxFeeArgs = IDL.Record({
    input_types: IDL.Vec(TxOutputType),
    pool_address: IDL.Vec(IDL.Text),
    output_types: IDL.Vec(TxOutputType),
  });
  const Result_1 = IDL.Variant({ Ok: IDL.Nat64, Err: IDL.Text });
  const FromUserRecord = IDL.Record({ user_id: IDL.Principal });
  const FromCanisterRecord = IDL.Record({
    canister_version: IDL.Opt(IDL.Nat64),
    canister_id: IDL.Principal,
  });
  const ChangeOrigin = IDL.Variant({
    from_user: FromUserRecord,
    from_canister: FromCanisterRecord,
  });
  const CreationRecord = IDL.Record({ controllers: IDL.Vec(IDL.Principal) });
  const CodeDeploymentMode = IDL.Variant({
    reinstall: IDL.Null,
    upgrade: IDL.Null,
    install: IDL.Null,
  });
  const CodeDeploymentRecord = IDL.Record({
    mode: CodeDeploymentMode,
    module_hash: IDL.Vec(IDL.Nat8),
  });
  const LoadSnapshotRecord = IDL.Record({
    canister_version: IDL.Nat64,
    taken_at_timestamp: IDL.Nat64,
    snapshot_id: IDL.Vec(IDL.Nat8),
  });
  const ChangeDetails = IDL.Variant({
    creation: CreationRecord,
    code_deployment: CodeDeploymentRecord,
    load_snapshot: LoadSnapshotRecord,
    controllers_change: CreationRecord,
    code_uninstall: IDL.Null,
  });
  const Change = IDL.Record({
    timestamp_nanos: IDL.Nat64,
    canister_version: IDL.Nat64,
    origin: ChangeOrigin,
    details: ChangeDetails,
  });
  const CanisterInfoResult = IDL.Record({
    controllers: IDL.Vec(IDL.Principal),
    module_hash: IDL.Opt(IDL.Vec(IDL.Nat8)),
    recent_changes: IDL.Vec(Change),
    total_num_changes: IDL.Nat64,
  });
  const Result_2 = IDL.Variant({ Ok: CanisterInfoResult, Err: IDL.Text });
  const ExchangePool = IDL.Record({
    exchange_id: IDL.Text,
    pool_address: IDL.Text,
    pool_key: IDL.Text,
  });
  const GetFailedInvokeLogArgs = IDL.Variant({
    All: IDL.Null,
    ByTxid: IDL.Text,
    ByStatusCode: IDL.Text,
    ByAddress: IDL.Text,
    BySecondsPassed: IDL.Nat64,
  });
  const Result_3 = IDL.Variant({ Ok: IDL.Text, Err: IDL.Text });
  const ExecutionStepLogView = IDL.Record({
    result: Result_3,
    exchange_id: IDL.Text,
    maybe_return_time: IDL.Opt(IDL.Text),
    calling_method: IDL.Text,
    calling_args: IDL.Text,
    pool_address: IDL.Text,
    calling_time: IDL.Text,
  });
  const InvokeLogView = IDL.Record({
    rollback_results: IDL.Vec(IDL.Text),
    invoke_args: IDL.Text,
    invoke_time: IDL.Text,
    finalized_time: IDL.Opt(IDL.Text),
    confirmed_time: IDL.Opt(IDL.Text),
    execution_steps: IDL.Vec(ExecutionStepLogView),
    processing_result: Result_3,
    broadcasted_time: IDL.Opt(IDL.Text),
  });
  const BlockBasic = IDL.Record({
    block_hash: IDL.Text,
    block_height: IDL.Nat32,
  });
  const ReceivedBlockView = IDL.Record({
    processing_results: IDL.Vec(IDL.Text),
    block_basic: BlockBasic,
    txids: IDL.Vec(IDL.Text),
    block_time: IDL.Text,
    received_time: IDL.Text,
  });
  const ExchangeStatus = IDL.Variant({
    Abandoned: IDL.Record({ reason: IDL.Text }),
    Active: IDL.Null,
    Halted: IDL.Record({ reason: IDL.Text }),
  });
  const ExchangeView = IDL.Record({
    status: ExchangeStatus,
    exchange_id: IDL.Text,
    canister_id: IDL.Principal,
    utxo_proof_enabled: IDL.Bool,
    client_canisters: IDL.Vec(IDL.Principal),
  });
  const RejectedTxView = IDL.Record({
    rollback_results: IDL.Vec(IDL.Text),
    txid: IDL.Text,
    received_time: IDL.Text,
    reason: IDL.Text,
  });
  const Network = IDL.Variant({
    mainnet: IDL.Null,
    regtest: IDL.Null,
    testnet: IDL.Null,
  });
  const OrchestratorSettings = IDL.Record({
    min_seconds_of_unconfirmed_tx_in_pool_for_raising_fee_rate: IDL.Nat32,
    exchange_registry_principal: IDL.Principal,
    max_input_count_of_psbt: IDL.Nat32,
    min_tx_confirmations: IDL.Nat32,
    mempool_connector_principal: IDL.Principal,
    max_unconfirmed_tx_count_in_pool: IDL.Nat32,
    min_btc_amount_for_utxo: IDL.Nat64,
    rune_indexer_principal: IDL.Principal,
    max_intentions_per_invoke: IDL.Nat32,
    mempool_connector_public_key: IDL.Text,
    max_received_blocks_count: IDL.Nat32,
    min_unconfirmed_tx_count_in_pool_for_raising_fee_rate: IDL.Nat32,
    bitcoin_network: Network,
  });
  const MempoolTxFeeRateView = IDL.Record({
    low: IDL.Nat64,
    high: IDL.Nat64,
    update_time: IDL.Text,
    medium: IDL.Nat64,
  });
  const OrchestratorStatus = IDL.Record({
    last_block: IDL.Opt(BlockBasic),
    pending_tx_count: IDL.Nat64,
    mempool_tx_fee_rate: MempoolTxFeeRateView,
    invoke_paused: IDL.Bool,
    concurrent_invoke_status: IDL.Text,
    last_block_time: IDL.Opt(IDL.Tuple(IDL.Nat64, IDL.Text)),
    failed_new_block_height: IDL.Opt(IDL.Tuple(IDL.Nat32, IDL.Text)),
  });
  const UtxoStatus = IDL.Variant({
    Error: IDL.Null,
    AvailableUnconfirmed: IDL.Null,
    InvalidTxid: IDL.Null,
    InvalidVout: IDL.Null,
    SpentInMempool: IDL.Null,
    SpentOnChain: IDL.Null,
    AvailableConfirmed: IDL.Null,
  });
  const UtxoWithStatus = IDL.Record({
    status: UtxoStatus,
    value: IDL.Opt(IDL.Text),
    txid: IDL.Text,
    vout: IDL.Nat32,
    ancestors: IDL.Opt(IDL.Nat32),
    address: IDL.Opt(IDL.Text),
  });
  const CoinBalance = IDL.Record({ id: IDL.Text, value: IDL.Nat });
  const Utxo = IDL.Record({
    coins: IDL.Vec(CoinBalance),
    sats: IDL.Nat64,
    txid: IDL.Text,
    vout: IDL.Nat32,
  });
  const CoinsInInputView = IDL.Record({
    status: IDL.Opt(UtxoWithStatus),
    coins: IDL.Vec(CoinBalance),
    utxo: Utxo,
    is_signed: IDL.Bool,
    owner_pubkey: IDL.Opt(IDL.Text),
    owner_address: IDL.Text,
  });
  const CoinsInInputsView = IDL.Record({
    coins_in_inputs: IDL.Vec(CoinsInInputView),
    txid: IDL.Text,
    signed_address_coins: IDL.Vec(IDL.Tuple(IDL.Text, IDL.Vec(CoinBalance))),
    address_coins: IDL.Vec(IDL.Tuple(IDL.Text, IDL.Vec(CoinBalance))),
  });
  const CoinsInOutputView = IDL.Record({
    is_op_return: IDL.Bool,
    utxo: Utxo,
    owner_address: IDL.Opt(IDL.Text),
  });
  const CoinsInOutputsView = IDL.Record({
    burned_coins: IDL.Vec(CoinBalance),
    coins_in_outputs: IDL.Vec(CoinsInOutputView),
    address_coins: IDL.Vec(IDL.Tuple(IDL.Text, IDL.Vec(CoinBalance))),
  });
  const InputCoin = IDL.Record({ coin: CoinBalance, from: IDL.Text });
  const OutputCoin = IDL.Record({ to: IDL.Text, coin: CoinBalance });
  const Intention = IDL.Record({
    input_coins: IDL.Vec(InputCoin),
    output_coins: IDL.Vec(OutputCoin),
    action: IDL.Text,
    exchange_id: IDL.Text,
    pool_utxo_spent: IDL.Vec(IDL.Text),
    action_params: IDL.Text,
    nonce: IDL.Nat64,
    pool_address: IDL.Text,
    pool_utxo_received: IDL.Vec(Utxo),
  });
  const IntentionSet = IDL.Record({
    tx_fee_in_sats: IDL.Nat64,
    initiator_address: IDL.Text,
    intentions: IDL.Vec(Intention),
  });
  const ExecutionContextView = IDL.Record({
    applied_fee_rate: IDL.Nat64,
    pool_addresses: IDL.Vec(IDL.Text),
    coins_in_inputs: CoinsInInputsView,
    txid: IDL.Text,
    estimated_min_tx_fee: IDL.Nat64,
    actual_tx_fee: IDL.Nat64,
    coins_in_outputs: CoinsInOutputsView,
    tx_vsize: IDL.Nat64,
    intention_set: IntentionSet,
    user_coins_in_inputs: IDL.Vec(CoinBalance),
    initially_signed_addresses: IDL.Vec(IDL.Text),
  });
  const TxStatus = IDL.Variant({
    Confirmed: IDL.Nat32,
    Rejected: IDL.Text,
    Pending: IDL.Null,
  });
  const TxDetailView = IDL.Record({
    status: IDL.Opt(TxStatus),
    invoke_log: InvokeLogView,
    included_block: IDL.Opt(BlockBasic),
    sent_tx_hex: IDL.Text,
  });
  const TxExecutionResult = IDL.Variant({
    Failed: InvokeLogView,
    NotFound: IDL.Null,
    Succeeded: TxDetailView,
  });
  const OutpointWithValue = IDL.Record({
    maybe_rune: IDL.Opt(CoinBalance),
    value: IDL.Nat64,
    script_pubkey_hex: IDL.Text,
    outpoint: IDL.Text,
  });
  const InvokeArgs = IDL.Record({
    client_info: IDL.Opt(IDL.Text),
    intention_set: IntentionSet,
    initiator_utxo_proof: IDL.Vec(IDL.Nat8),
    psbt_hex: IDL.Text,
  });
  const NewBlockDetectedArgs = IDL.Record({
    block_hash: IDL.Text,
    block_timestamp: IDL.Nat64,
    tx_ids: IDL.Vec(IDL.Text),
    block_height: IDL.Nat32,
  });
  const Result_4 = IDL.Variant({ Ok: IDL.Vec(IDL.Text), Err: IDL.Text });
  const RegisterExchangeArgs = IDL.Record({
    exchange_canister: IDL.Principal,
    exchange_id: IDL.Text,
    utxo_proof_enabled: IDL.Bool,
    client_canisters: IDL.Vec(IDL.Principal),
  });
  const RejectTxArgs = IDL.Record({
    txid: IDL.Text,
    reason_code: IDL.Text,
    reason: IDL.Text,
  });
  const SaveIncludedBlockForTxArgs = IDL.Record({
    txid: IDL.Text,
    timestamp: IDL.Nat64,
    block: BlockBasic,
  });
  const SetTxFeePerVbyteArgs = IDL.Record({
    low: IDL.Nat64,
    high: IDL.Nat64,
    medium: IDL.Nat64,
  });
  return IDL.Service({
    abandon_exchange: IDL.Func([AbandonExchangeArgs], [Result], []),
    clear_exchange_pools: IDL.Func([], [Result], []),
    clear_failed_invoke_logs: IDL.Func(
      [IDL.Opt(IDL.Nat64), IDL.Vec(IDL.Text)],
      [Result],
      []
    ),
    clear_last_block: IDL.Func([], [Result], []),
    clear_rejected_txs: IDL.Func([], [Result], []),
    clear_txs_with_min_confirmations: IDL.Func([IDL.Nat32], [Result], []),
    delete_tx_detail: IDL.Func([IDL.Text], [Result], []),
    delete_used_outpoints: IDL.Func([IDL.Text], [Result], []),
    estimate_min_tx_fee: IDL.Func(
      [EstimateMinTxFeeArgs],
      [Result_1],
      ["query"]
    ),
    get_canister_info: IDL.Func([IDL.Nat64], [Result_2], []),
    get_exchange_pools: IDL.Func([], [IDL.Vec(ExchangePool)], ["query"]),
    get_failed_invoke_logs: IDL.Func(
      [GetFailedInvokeLogArgs],
      [IDL.Vec(IDL.Tuple(IDL.Text, InvokeLogView))],
      ["query"]
    ),
    get_last_sent_txs: IDL.Func(
      [],
      [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text, IDL.Opt(IDL.Nat32)))],
      ["query"]
    ),
    get_received_blocks: IDL.Func(
      [IDL.Opt(IDL.Bool)],
      [IDL.Vec(ReceivedBlockView)],
      ["query"]
    ),
    get_registered_exchanges: IDL.Func(
      [IDL.Opt(ExchangeStatus)],
      [IDL.Vec(ExchangeView)],
      ["query"]
    ),
    get_rejected_txs: IDL.Func([], [IDL.Vec(RejectedTxView)], ["query"]),
    get_settings: IDL.Func([], [OrchestratorSettings], ["query"]),
    get_status: IDL.Func([], [OrchestratorStatus], ["query"]),
    get_tx_execution_context_view: IDL.Func(
      [IDL.Text],
      [IDL.Opt(ExecutionContextView)],
      ["query"]
    ),
    get_tx_execution_result: IDL.Func(
      [IDL.Text],
      [TxExecutionResult],
      ["query"]
    ),
    get_tx_for_outpoint: IDL.Func(
      [IDL.Text],
      [IDL.Opt(TxDetailView)],
      ["query"]
    ),
    get_tx_queue_of_pool: IDL.Func(
      [IDL.Text],
      [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Opt(IDL.Nat32)))],
      ["query"]
    ),
    get_tx_sent: IDL.Func([IDL.Text], [IDL.Opt(TxDetailView)], ["query"]),
    get_used_outpoints: IDL.Func(
      [IDL.Opt(IDL.Text)],
      [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text))],
      ["query"]
    ),
    get_zero_confirmed_tx_count_of_pool: IDL.Func(
      [IDL.Text],
      [IDL.Nat32],
      ["query"]
    ),
    get_zero_confirmed_txs: IDL.Func(
      [IDL.Opt(IDL.Text)],
      [IDL.Vec(IDL.Text)],
      ["query"]
    ),
    get_zero_confirmed_utxos_of_address: IDL.Func(
      [IDL.Text],
      [IDL.Vec(OutpointWithValue)],
      ["query"]
    ),
    init_status_code_message: IDL.Func([], [Result], []),
    inspect_status_code: IDL.Func([IDL.Text], [IDL.Text], ["query"]),
    invoke: IDL.Func([InvokeArgs], [Result_3], []),
    new_block_detected: IDL.Func([NewBlockDetectedArgs], [Result], []),
    notify_exchange_for_blocks_from_height: IDL.Func(
      [IDL.Text, IDL.Nat32],
      [Result_4],
      []
    ),
    notify_exchanges_for_block: IDL.Func(
      [IDL.Vec(IDL.Text), BlockBasic, IDL.Nat64, IDL.Vec(IDL.Text)],
      [Result_4],
      []
    ),
    pause_invoke: IDL.Func([], [Result], []),
    reapply_tx: IDL.Func([IDL.Text], [Result], []),
    register_exchange: IDL.Func([RegisterExchangeArgs], [Result], []),
    reject_tx: IDL.Func([RejectTxArgs], [Result], []),
    resume_invoke: IDL.Func([], [Result], []),
    rollback_tx: IDL.Func([IDL.Text], [Result_4], []),
    save_included_block_for_tx: IDL.Func(
      [SaveIncludedBlockForTxArgs],
      [Result],
      []
    ),
    set_bitcoin_network: IDL.Func([Network], [Result], []),
    set_exchange_registry_principal: IDL.Func([IDL.Principal], [Result], []),
    set_max_input_count_of_psbt: IDL.Func([IDL.Nat32], [Result], []),
    set_max_intentions_per_invoke: IDL.Func([IDL.Nat32], [Result], []),
    set_max_received_blocks_count: IDL.Func([IDL.Nat32], [Result], []),
    set_max_unconfirmed_tx_count_in_pool: IDL.Func([IDL.Nat32], [Result], []),
    set_mempool_connector_principal: IDL.Func([IDL.Principal], [Result], []),
    set_mempool_connector_public_key: IDL.Func([IDL.Text], [Result], []),
    set_min_btc_amount_for_utxo: IDL.Func([IDL.Nat64], [Result], []),
    set_min_tx_confirmations: IDL.Func([IDL.Nat32], [Result], []),
    set_rune_indexer_principal: IDL.Func([IDL.Principal], [Result], []),
    set_tx_fee_per_vbyte: IDL.Func([SetTxFeePerVbyteArgs], [Result], []),
    unhalt_exchange: IDL.Func([IDL.Text], [Result], []),
    version: IDL.Func([], [IDL.Text], ["query"]),
  });
};
