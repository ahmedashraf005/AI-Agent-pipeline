using System.Collections.Concurrent;
using System.Threading.Channels;

namespace GatewayApi.Services;

public sealed class InFlightJobBroadcaster
{
    private readonly ConcurrentDictionary<Guid, JobChannel> _channels = new();

    public bool TryRegister(Guid jobId) =>
        _channels.TryAdd(jobId, new JobChannel());

    public bool TrySubscribe(Guid jobId, out JobSubscription? subscription)
    {
        if (_channels.TryGetValue(jobId, out var channel))
        {
            subscription = channel.Subscribe();
            return true;
        }

        subscription = null;
        return false;
    }

    public void Publish(Guid jobId, string line)
    {
        if (_channels.TryGetValue(jobId, out var channel))
        {
            channel.Publish(line);
        }
    }

    public void Complete(Guid jobId)
    {
        if (_channels.TryRemove(jobId, out var channel))
        {
            channel.Complete();
        }
    }

    public sealed class JobChannel
    {
        private readonly object _gate = new();
        private readonly List<string> _buffer = [];
        private readonly List<Channel<string>> _subscribers = [];
        private bool _completed;

        public JobSubscription Subscribe()
        {
            var subscriber = Channel.CreateUnbounded<string>(new UnboundedChannelOptions
            {
                SingleReader = true,
                SingleWriter = false
            });

            lock (_gate)
            {
                var bufferedLines = _buffer.ToArray();

                if (_completed)
                {
                    subscriber.Writer.TryComplete();
                    return new JobSubscription(bufferedLines, subscriber.Reader, () => { });
                }

                _subscribers.Add(subscriber);
                return new JobSubscription(
                    bufferedLines,
                    subscriber.Reader,
                    () => RemoveSubscriber(subscriber));
            }
        }

        public void Publish(string line)
        {
            lock (_gate)
            {
                if (_completed)
                {
                    return;
                }

                _buffer.Add(line);

                foreach (var subscriber in _subscribers.ToArray())
                {
                    if (!subscriber.Writer.TryWrite(line))
                    {
                        _subscribers.Remove(subscriber);
                    }
                }
            }
        }

        public void Complete()
        {
            lock (_gate)
            {
                if (_completed)
                {
                    return;
                }

                _completed = true;

                foreach (var subscriber in _subscribers)
                {
                    subscriber.Writer.TryComplete();
                }

                _subscribers.Clear();
            }
        }

        private void RemoveSubscriber(Channel<string> subscriber)
        {
            lock (_gate)
            {
                _subscribers.Remove(subscriber);
                subscriber.Writer.TryComplete();
            }
        }
    }
}

public sealed class JobSubscription(
    IReadOnlyList<string> bufferedLines,
    ChannelReader<string> reader,
    Action dispose) : IDisposable
{
    public IReadOnlyList<string> BufferedLines { get; } = bufferedLines;

    public ChannelReader<string> Reader { get; } = reader;

    public void Dispose() => dispose();
}
